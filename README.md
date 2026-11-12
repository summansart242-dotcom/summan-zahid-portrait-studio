# Summan Zahid · Portrait Studio

The portfolio is a static website in `dist`. The portfolio and Studio work at a GitHub Pages project address or at a custom domain.

## Edit the portfolio

1. Open **Studio** at the site's `studio/` address.
2. Edit the artist profile, upload or reorder artwork, set individual prices, and choose the homepage portrait. Update commission details, frequently asked questions, and contact and social links.
3. Use **Save changes** to keep edits in this browser and **Preview** to see them in the portfolio.
4. To make the updates visible to everyone, open **Live publishing settings**, connect with your portfolio’s GitHub token, and click **Publish live**. Follow **View deployment status** and wait for a green check, then refresh the portfolio.

## Set up GitHub Pages

1. Put this project in a GitHub repository the artist owns or can edit.
2. Under **Settings → Pages → Build and deployment**, choose **GitHub Actions**.
3. In Studio, add the artist's work and confirm the name, commission rates, and public contact details.
4. Create a [fine-grained GitHub access token](https://github.com/settings/personal-access-tokens/new) for this repository with **Contents: Read and write**. Enter it in Studio with the repository name and its default branch. Studio keeps it for the current editing session.
5. Publish from Studio. Once GitHub Pages finishes, bookmark its `studio/` address for future edits.

GitHub keeps past versions of the site and its assets in repository history. Upload the web copies the artist wants to share.
