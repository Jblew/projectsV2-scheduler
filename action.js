const { GraphQLAdapter } = require("./graphql-adapter")

module.exports = async ({
    github,
    project, statusFieldName, scheduleFieldName, scheduleStateName, todoStateName,
}) => {
    const graphql = new GraphQLAdapter({ github })
    const { projectNodeID, statusFieldID, statusFieldOptions } = await getProjectV2({ url: project, statusFieldName, scheduleFieldName })
    const todoOptionID = getFieldOptionID(statusFieldOptions, todoStateName)
    const items = await getProjectItems({ projectNodeID, scheduleFieldName, statusFieldName })
    const { itemsToDeschedule, errors } = filterItems({ items, scheduleStateName })
    for (const itemToDeschedule of itemsToDeschedule) {
        const itemID = itemToDeschedule.id
        await descheduleItem({ projectNodeID, itemID, statusFieldID, todoOptionID })
            .catch(error => errors.push(`${error}`))
    }

    if (errors.length > 0) {
        throw new Error(`There were errors while scheduling: \n - ${errors.join('\n- ')}\n`)
    }

    async function getProjectV2({ url, statusFieldName, scheduleFieldName }) {
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
            throw new Error(`Type of status field named "${statusFieldName}" is not DATE`)
        }
        const projectNodeID = projectV2.id
        const statusFieldID = projectV2.statusField.id
        const scheduleFieldID = projectV2.scheduleField.id
        const statusFieldOptions = projectV2.statusField.options
        return { projectNodeID, statusFieldID, scheduleFieldID, statusFieldOptions }
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

    function getFieldOptionID(options, name) {
        const foundOptions = options.filter(option => option.name.toLowerCase() === name.toLowerCase())
        if (foundOptions.length === 0) {
            throw new Error(`So such field option: ${name}. Available options are: ${options.map(o => o.name).join(", ")}`)
        }
        return foundOptions[0].id
    }

    async function getProjectItems({ projectNodeID, statusFieldName, scheduleFieldName }) {
        const query = `
        query GetProjectItems($endCursor: String) {
            node(id: "${projectNodeID}") {
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
                                schedule: fieldValueByName(name: "${scheduleFieldName}") {
                                    ... on ProjectV2ItemFieldDateValue {
                                        date
                                    }
                                }
                                status: fieldValueByName(name: "${statusFieldName}") {
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
        return graphql.paginateQuery(query, (data) => data.node.items)
    }

    function filterItems({ items, scheduleStateName }) {
        const errors = []
        const itemsToDeschedule = []
        const scheduledItems = items.filter(item => item.status && item.status.name.toLowerCase() === scheduleStateName.toLowerCase())
        for (const item of scheduledItems) {
            const { deschedule, error } = shouldDescheduleItem(item)
            if (error) {
                errors.push(error)
            }
            if (deschedule) {
                itemsToDeschedule.push(item)
            }
        }
        return { itemsToDeschedule, errors }
    }

    function shouldDescheduleItem(item) {
        const title = item.content.title
        if (!item.schedule || !item.schedule.date) {
            return { error: `Item ${title} does not have a schedule field` }
        }
        const scheduleValue = item.schedule.date
        const datemillis = Date.parse(scheduleValue)
        if (typeof datemillis !== "number") {
            return { error: `Item ${title} has invalid schedule field value: ${scheduleValue}` }
        }
        if (datemillis < Date.now()) {
            return { deschedule: true }
        }
        return { deschedule: false }
    }

    async function descheduleItem({ projectNodeID, itemID, statusFieldID, todoOptionID }) {
        await graphql.mutation(`
        mutation DescheduleItem {
            updateProjectV2ItemFieldValue(
                input: {
                    clientMutationId: "${(new Date()).getTime()}${Math.random()}"
                    projectId: "${projectNodeID}"
                    itemId: "${itemID}"
                    fieldId: "${statusFieldID}"
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
}