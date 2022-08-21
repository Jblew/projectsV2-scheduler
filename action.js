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
    console.log('Found params', {
        project, statusFieldName, scheduleFieldName, scheduleStateName, todoStateName,
        statusFieldID,
        scheduleFieldID,
        scheduleOptionID,
        todoOptionID
    })


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
        console.log(options)
        const foundOptions = options.filter(option => option.name.toLowerCase() === name.toLowerCase())
        if (foundOptions.length === 0) {
            throw new Error(`So such field option: ${name}. Available options are: ${options.map(o => o.name).join(", ")}`)
        }
        return foundOptions[0].id
    }

    async function callGraphQL(opts) {
        return github.graphql({
            ...opts,
            headers: {
                accept: 'application/vnd.github.v3.raw+json'
            }
        });
    }
}