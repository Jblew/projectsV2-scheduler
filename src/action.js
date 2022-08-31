const { GraphQLAdapter } = require("./graphql-adapter")
const { fetchSchedulableProject } = require("./schedulable-project")

module.exports = async ({
    github, log,
    projectURL, statusFieldName, scheduleFieldName, scheduleStateName, todoStateName,
}) => {
    log(`Running projectsv2 scheduler with params: ${prettyJSON({ projectURL, statusFieldName, scheduleFieldName, scheduleStateName, todoStateName, })}`)
    const graphql = new GraphQLAdapter({ github })
    const project = await fetchSchedulableProject({
        graphql, url: projectURL, statusFieldName, scheduleFieldName,
        scheduleStateName, todoStateName,
    })
    const scheduledItems = await project.getScheduledItems()
    log(`Scheduled items (${scheduledItems.length}): ${prettyJSON(scheduledItems)}`)
    for (const item of scheduledItems) {
        if (Date.now() > item.date.getTime()) {
            log(`Descheduling item: ${prettyJSON(item)}`)
            await project.deschedule(item)
            log('Done')
        }
    }
    log('All done')
}

function prettyJSON(obj) {
    return JSON.stringify(obj, undefined, 2)
}