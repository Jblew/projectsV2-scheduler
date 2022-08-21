module.exports = async ({
    github,
    project, statusFieldName, scheduleFieldName, scheduleStateName, todoStateName,
}) => {
    const projectNodeID = await getProjectNodeID(project)
    const { statusFieldID, scheduleFieldID, statusFieldOptions } = await getFieldIDs({
        projectNodeID, scheduleFieldName, statusFieldName
    })
    const scheduleOptionID = getFieldOptionID(statusFieldOptions, scheduleStateName)
    const todoOptionID = getFieldOptionID(statusFieldOptions, todoStateName)
    const items = await getProjectItems({ projectNodeID, scheduleFieldName, statusFieldName })
    const { itemsToDeschedule, errors } = filterItems({ items, scheduleStateName })
    console.log("TO DESCHEDULE:", itemsToDeschedule)
    console.log("ERRORS:", errors)


    async function getProjectNodeID(url) {
        const match = /^.*(?<type>orgs|users)\/(?<name>[^\/]+)\/projects\/(?<number>[0-9]+).*$/gm
            .exec(url.trim())
        if (!match || !match.groups || !match.groups.type || !match.groups.name || !match.groups.number) {
            throw new Error('Malformed project url')
        }
        const { type, name, number } = match.groups
        return type === "orgs" ?
            await getOrgProjectNodeID({ name, number })
            : await getUserProjectNodeID({ name, number })
    }

    async function getOrgProjectNodeID({ name, number }) {
        const query = `
        query FindOrgProjectNodeID {
            organization(login: "${name}") {
                projectV2(number: ${number}) {
                    id
                }
            }
        }`
        const data = await callGraphQL({ query })
        return data.organization.projectV2.id
    }

    async function getUserProjectNodeID({ name, number }) {
        const query = `
        query FindUserProjectNodeID {
            user(login: "${name}") {
                projectV2(number: ${number}) {
                    id
                }
            }
        }`
        const data = await callGraphQL({ query })
        return data.user.projectV2.id
    }

    async function getFieldIDs({ projectNodeID, scheduleFieldName, statusFieldName }) {
        const query = `
        query FindFieldIDs {
            node(id: "${projectNodeID}") {
                ... on ProjectV2 {
                    statusField: field(name: "${statusFieldName}") {
                        ... on ProjectV2SingleSelectField {
                            id
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
                            name
                            dataType
                        }
                    }
                }
            }
        }
        `
        const data = await callGraphQL({ query })
        const statusFieldID = data.node.statusField.id
        const scheduleFieldID = data.node.scheduleField.id
        const statusFieldOptions = data.node.statusField.options
        return { statusFieldID, scheduleFieldID, statusFieldOptions }
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
                                    ... on ProjectV2ItemFieldTextValue {
                                        text
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
        return paginateGraphQLQuery(query, (data) => data.node.items)
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
        if (!item.schedule || !item.schedule.text) {
            return { error: `Item ${title} does not have a schedule field` }
        }
        const scheduleValue = item.schedule.text
        const datemillis = Date.parse(scheduleValue)
        if (typeof datemillis !== "number") {
            return { error: `Item ${title} has invalid schedule field value: ${scheduleValue}` }
        }
        if (datemillis < Date.now()) {
            return { deschedule: true }
        }
    }

    async function callGraphQL(opts) {
        return github.graphql({
            ...opts,
            headers: {
                accept: 'application/vnd.github.v3.raw+json'
            }
        });
    }

    async function paginateGraphQLQuery(query, itemsObjectGetterFn) {
        if (query.indexOf("$endCursor") == -1) throw new Error("Query must specify $endCursor variable")
        if (query.indexOf("pageInfo") == -1) throw new Error("Query must get the pageInfo data")


        let endCursor = ""
        let hasNextPage = true
        const items = []
        while (hasNextPage) {
            const data = await callGraphQL({ query, endCursor })
            const currentItems = itemsObjectGetterFn(data)
            items.push(...currentItems.nodes)
            endCursor = currentItems.pageInfo.endCursor
            hasNextPage = currentItems.pageInfo.hasNextPage
        }
        return items
    }
}