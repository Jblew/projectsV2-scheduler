
class SchedulableProject {
    constructor({
        projectNodeID,
        statusFieldID,
        statusFieldOptions,
        scheduleFieldName,
        scheduleStateName,
        todoStateName,
        statusFieldName,
        graphql
    }) {
        this.projectNodeID = projectNodeID || (() => { throw new Error('Missing projectNodeID') })()
        this.statusFieldID = statusFieldID || (() => { throw new Error('Missing statusFieldID') })()
        this.scheduleFieldName = scheduleFieldName || (() => { throw new Error('Missing scheduleFieldName') })()
        this.statusFieldName = statusFieldName || (() => { throw new Error('Missing statusFieldName') })()
        this.statusFieldOptions = statusFieldOptions || (() => { throw new Error('Missing statusFieldName') })()
        this.scheduleStateName = scheduleStateName || (() => { throw new Error('Missing scheduleStateName') })()
        this.todoStateName = todoStateName || (() => { throw new Error('Missing todoStateName') })()
        this.graphql = graphql || (() => { throw new Error('Missing graphql') })()
    }

    async getScheduledItems() {
        const items = await this._getProjectItems()
        return items
            .filter(item => this._isScheduledItem(item))
            .map(item => this._parseScheduledItem(item))
    }

    async _getProjectItems() {
        const query = `
        query GetProjectItems($endCursor: String) {
            node(id: "${this.projectNodeID}") {
                ... on ProjectV2 {
                    items(first: 100, after: $endCursor) {
                        nodes {
                            id
                            ... on ProjectV2Item {
                                content {
                                    ... on DraftIssue {
                                        title
                                    }
                                    ... on Issue {
                                        title
                                    }
                                    ... on PullRequest {
                                        title
                                    }
                                }
                                schedule: fieldValueByName(name: "${this.scheduleFieldName}") {
                                    ... on ProjectV2ItemFieldDateValue {
                                        date
                                    }
                                }
                                status: fieldValueByName(name: "${this.statusFieldName}") {
                                    ... on ProjectV2ItemFieldSingleSelectValue {
                                        name
                                    }
                                }
                            }
                        }
                        pageInfo {
                            hasNextPage
                            endCursor
                        }
                    }
                }
            }
        }
        `
        return this.graphql.paginateQuery(query, (data) => data.node.items)
    }

    async deschedule(item) {
        const itemID = item.id
        const todoOptionID = this._getFieldOptionID(this.todoStateName)
        await this.graphql.mutation(`
        mutation DescheduleItem {
            updateProjectV2ItemFieldValue(
                input: {
                    projectId: "${this.projectNodeID}"
                    itemId: "${itemID}"
                    fieldId: "${this.statusFieldID}"
                    value: {
                        singleSelectOptionId: "${todoOptionID}"
                    }
                }
            ) {
                projectV2Item {
                    id
                }
            }
        }
        `)
    }

    _getFieldOptionID(fieldName) {
        const foundOptions = this.statusFieldOptions
            .filter(option => option.name.toLowerCase() === fieldName.toLowerCase())
        if (foundOptions.length === 0) {
            throw new Error(`So such field option: ${fieldName}. Available options are: ${this.statusFieldOptions.map(o => o.name).join(", ")}`)
        }
        return foundOptions[0].id
    }

    _isScheduledItem(item) {
        return item.status && item.status?.name?.toLowerCase() === this.scheduleStateName.toLowerCase()
    }

    _parseScheduledItem(item) {
        return {
            ...item,
            date: item.schedule?.date ? new Date(item.schedule?.date) : new Date(NaN)
        }
    }
}

async function fetchSchedulableProject({ graphql, url, statusFieldName, scheduleFieldName, scheduleStateName, todoStateName }) {
    const { ownerType, ownerLogin, projectNumber } = parseProjectURL(url)
    const data = await graphql.query(`
            query GetProjectV2Data {
                ${ownerType}(login: "${ownerLogin}") {
                    projectV2(number: ${projectNumber}) {
                        id
                        statusField: field(name: "${statusFieldName}") {
                            ... on ProjectV2Field {
                                id
                                dataType
                            }
                            ... on ProjectV2SingleSelectField {
                                id
                                dataType
                                options {
                                    id
                                    name
                                    nameHTML
                                }
                            }
                        }
                        scheduleField: field(name: "${scheduleFieldName}") {
                            ... on ProjectV2Field {
                                id
                                dataType
                            }
                        }
                    }
                }
            }
        `)
    const projectV2 = data[ownerType].projectV2
    if (!projectV2.statusField) {
        throw new Error(`Project does not have a status field named "${statusFieldName}"`)
    }
    if (!projectV2.scheduleField) {
        throw new Error(`Project does not have a schedule field named "${scheduleField}"`)
    }
    if (projectV2.statusField.dataType !== "SINGLE_SELECT") {
        throw new Error(`Type of status field named "${statusFieldName}" is not SINGLE_SELECT`)
    }
    if (projectV2.scheduleField.dataType !== "DATE") {
        throw new Error(`Type of schedule field named "${scheduleFieldName}" is not DATE`)
    }
    const projectNodeID = projectV2.id
    const statusFieldID = projectV2.statusField.id
    const scheduleFieldID = projectV2.scheduleField.id
    const statusFieldOptions = projectV2.statusField.options
    return new SchedulableProject(
        { graphql, projectNodeID, statusFieldID, scheduleFieldID, statusFieldOptions, statusFieldName, scheduleFieldName, scheduleStateName, todoStateName }
    )
}

function parseProjectURL(url) {
    const match = /^.*(?<type>orgs|users)\/(?<name>[^\/]+)\/projects\/(?<number>[0-9]+).*$/gm
        .exec(url.trim())
    if (!match || !match.groups || !match.groups.type || !match.groups.name || !match.groups.number) {
        throw new Error('Malformed project url')
    }
    const { type, name, number } = match.groups
    return {
        ownerType: type === "orgs" ? "organization" : "user",
        ownerLogin: name,
        projectNumber: number
    }
}

module.exports = { SchedulableProject, fetchSchedulableProject }