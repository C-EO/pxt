# Teacher Tool

## Localhost testing

To test the Teacher Tool locally:

1. Ensure your pxt repo is up to date and has been built recently.
2. In a command shell, in the `pxt` repo, cd into the `teachertool` folder and start the Teacher Tool dev server: `npm run start`. This will *not* open a browser window.
3. In another command shell, in the target repo (e.g. `pxt-arcade` or `pxt-microbit`), start the pxt dev server: `pxt serve --rebundle --noauth`. This will open the editor webapp in a browser.
   1. **Note the `--noauth` parameter.** It is important to include this option when running on localhost in order to download certain required startup files from the localhost pxt server.

Requests to the `/eval` endpoint will be routed to the Teacher Tool dev server.

Debug and step through Teacher Tool code using the browser dev tools (F12 to open).

To skip having to log in on localhost, add `?noauth=1` to the end of the url.


## Test in staging environment

1. In the pxt repo, run `gulp` to ensure production teacher tool is built.
2. In a browser, go to `https://staging.pxt.io/oauth/gettoken`. This should return a url with an auth token embedded. Copy the entire url value to your clipboard.
   - It should look something like `https://staging.pxt.io/?access_token=X.XXXXXXXX`
   - If you get access denied, contact your manager to help you.
3. In a command shell, set environment variable `PXT_ACCESS_TOKEN` with the copied value.
4. In the same shell, in the pxt-arcade repo, run `pxt uploadtrg --rebundle`. This should return a url to your private build.
   - It should look something like `https://arcade.staging.pxt.io/app/XXXXXX-XXXXX`
 - Paste in a browser and append "/teachertool". This should take you to your teacher tool build in staging.

## Test in production environment

Follow the "Test in staging environment" instructions, but get your auth token from `https://makecode.com/oauth/gettoken`.