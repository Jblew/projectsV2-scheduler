module.exports = async ({ github, context, core }) => {
    const { project, scheduleStateName, scheduleFieldName } = getInputs()
    const projectNodeID = await getProjectNodeID(project)

    function getInputs() {
        const project = core.getInput('project')
        if (!project) throw new Error(`Missing input 'project'`)
        const scheduleStateName = core.getInput('schedule-state-name')
        if (!scheduleStateName) throw new Error(`Missing input 'schedule-state-name'`)
        const scheduleFieldName = core.getInput('schedule-field-name')
        if (!scheduleFieldName) throw new Error(`Missing input 'schedule-field-name'`)
        return { project, scheduleStateName, scheduleFieldName }
    }

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
        const { name, number } = options
        const query = `
        query FindOrgProjectNodeID {
            organization(login: "${name}") {
                projectV2(number: ${number}) {
                    id
                }
            }
        }
        `
        const data = await callGraphQL(query)
        return data.organization.projectV2.id
    }

    async function getUserProjectNodeID({ name, number }) {
        const { name, number } = options
        const query = `
        query FindUserProjectNodeID {
            user(login: "${name}") {
                projectV2(number: ${number}) {
                    id
                }
            }
        }
        `
        const data = await callGraphQL({ query })
        return data.user.projectV2.id
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