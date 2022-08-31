import { Octokit } from "@octokit/rest";
import script from "../action.js"
import * as dotenv from 'dotenv'
dotenv.config()

const octokit = new Octokit({
    auth: process.env.GH_TOKEN,
});
console.log(script)

script({
    github: octokit,
    log: console.log,
    projectURL: process.env.PROJECT_URL,
    scheduleFieldName: process.env.SCHEDULE_FIELD_NAME,
    statusFieldName: process.env.STATUS_FIELD_NAME,
    scheduleStateName: process.env.SCHEDULE_STATE_NAME,
    todoStateName: process.env.TODO_STATE_NAME,
}).catch(console.error)