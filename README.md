# Github Projects V2 scheduler
Github Action that schedules an item in Projects V2

- You can configure on which day an item in ProjectV2 becomes a TODO.
- Just set the state of the item to `Scheduled` and set a schedule date in `Schedule` field.
- Set up a scheduler github action that will monitor your project and deschedule items (move them to TODO) on a specified date.



## How to install

1. Create a project V2
2. Add a new field named `Schedule` to the project. Set it's type to `Date`
3. Edit the field `State` and add a new option called `Scheduled`
4. Create a scheduler repository and add a new Github Action workflow as follows:
   ```yaml
   on:
     schedule:
       - cron: "30 5 * * *" # Every day at 5:30
   
   jobs:
     project-items-scheduler:
       runs-on: ubuntu-latest
       steps:
         - uses: jblew/projectsV2-scheduler@v1
           with:
             token: "${{ secrets.GH_PAT }}"
             project: users/{username}/projects/{project_number}
             schedule-state-name: Scheduled
             schedule-field-name: Schedule
   ```
5. Generate a Personal Access Token (PAT) with full `project` scope. Add the token as a secret to scheduler repository.

Voila!



***

Made with 😇 by [Jędrzej Bogumił Lewandowski](https://jblewandowski.com/).
