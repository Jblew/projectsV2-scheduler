class GraphQLAdapter {
    constructor({ github }) {
        this.github = github
    }

    query(query) {
        return this._call({ query })
    }

    mutation(mutation) {
        return this._call({ query: mutation })
    }

    async paginateQuery(query, itemsObjectGetterFn) {
        if (query.indexOf("$endCursor") == -1) throw new Error("Query must specify $endCursor variable")
        if (query.indexOf("pageInfo") == -1) throw new Error("Query must get the pageInfo data")


        let endCursor = ""
        let hasNextPage = true
        const items = []
        while (hasNextPage) {
            const data = await this._call({ query, endCursor })
            const currentItems = itemsObjectGetterFn(data)
            items.push(...currentItems.nodes)
            endCursor = currentItems.pageInfo.endCursor
            hasNextPage = currentItems.pageInfo.hasNextPage
        }
        return items
    }

    async _call(opts) {
        return this.github.graphql({
            ...opts,
            headers: {
                accept: 'application/vnd.github.v3.raw+json'
            }
        });
    }
}

module.exports = { GraphQLAdapter }