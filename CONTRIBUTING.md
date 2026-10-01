# Team workflow

Use one repository with `main` as the integration branch. Each workstream opens focused pull requests from short-lived branches such as `bim/ifc-import`, `data/carbon-baseline`, `ai/roof-options`, and `app/scenario-comparison`. Link each pull request to its issue and ask another teammate to review it before merging.

Keep the shared model/scenario contract stable across workstreams. If a change affects another owner, update the contract and coordinate the consumer in the same integration cycle. Demonstrate the end-to-end flow frequently with the same permitted sample IFC and clearly labelled sample data.

For backend development, follow the current language and framework conventions and reuse framework capabilities. Before adding a dependency, changing directories or frameworks, or defining custom error codes, explain the reason and update `ARCHITECTURE.md`.
