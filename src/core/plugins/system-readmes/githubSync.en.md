GitHub Sync backs up your workspace to a GitHub repository. It is a one-way upload: Nevo never pulls or merges changes back into your workspace.

## Setup

- Open the plugin and choose **Configure**, then fill in the settings below.
- **Repository**: in `owner/name` form.
- **Branch**: the branch to back up to (`main` if left empty). Use a dedicated branch or repository.
- **Access token**: a personal access token with `repo` scope. It is kept in your operating system's secure storage, not in the workspace.
- **Commit message**: the message for each backup commit (`Nevo backup` if left empty).
- **Automatic sync** and **Interval (minutes)**: upload on a timer, from 1 minute to 24 hours. The first automatic sync runs after one full interval.

## Usage

- Choose **Test connection** to check the repository and token.
- Choose **Sync now** to upload immediately. The status shows the last sync time and the number of files.

## What is uploaded

- Notes, folders, assets, boards, databases, templates and history, as in a workspace export. Installed plugins are not included.
- Files that are already identical in the repository are not uploaded again.
- Files larger than 25 MiB are skipped, and the whole workspace must stay under 512 MiB.

## Notes

- The branch is replaced with a copy of the workspace: files that are not in the workspace are removed from the branch, while the commit history is kept.
- Only one sync can run at a time for a workspace.
