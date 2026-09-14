# Release requirements

- Every release must generate a local Windows x64 friend-distribution ZIP. Do not report a release complete with only dist or a package requiring the recipient to install Node.js.
- On the local Windows workspace, use `npm run release`. `package:game` also generates the friend ZIP automatically on Windows.
- The friend ZIP must include the portable runtime, production assets, licenses, PLAY.cmd (online), SOLO.cmd (offline), instructions and a manifest. Do not include accounts, credentials, saves or research/source artifacts.
- Preserve timestamped releases and update `artifacts/Project-Strike-Windows-latest.zip`. Verify the bundled runtime and ZIP contents, then give the user a clickable link to the latest ZIP and brief unzip/double-click instructions.
- Non-Windows CI builds do not satisfy the local Windows distribution requirement. Public deployment remains separate and requires the user's authorization.
- 每次修改执行完都要commit 并且推送部署到github仓库
