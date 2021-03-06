// standard modules
require('dotenv').config();
const outdent = require('outdent');
const chalk = require('chalk');
const log = require('loglevel');
log.setLevel(process.env.LOG_LEVEL ? process.env.LOG_LEVEL : 'info');

// magic eye modules
const { isRepostRemoval, removePost, printSubmission } = require('../../../../reddit_utils.js');

//=====================================

async function removeBlacklisted(reddit, modComment, submission, lastSubmission, existingMagicSubmission, subSettings, subredditName) {
    if (!subSettings.removeBlacklisted) {
        return true;
    }

    // We missed detecting a valid repost so a mod manually removed it. That image is reposted but we don't know the approved submission.
    const lastIsRemovedAsRepost = await isRepostRemoval(modComment); 

    const imageIsBlacklisted = await lastSubmission.removed && !lastIsRemovedAsRepost;
    if (imageIsBlacklisted) {
        const removalReason = await getRemovalReason(modComment, subredditName);
        if (removalReason == null) {
            log.info(`[${subredditName}]`, chalk.red("Ignoring submission because couldn't read the last removal message. Submission: ", await printSubmission(submission), ", removal message thread: http://redd.it/", existingMagicSubmission.reddit_id));
            existingMagicSubmission.reddit_id = await submission.id; // update the last/reference post
        } else {
            removeAsBlacklisted(reddit, submission, lastSubmission, removalReason, subSettings, subredditName);
        }
    
        return false;
    }
   
    return true;
}

async function removeAsBlacklisted(reddit, submission, lastSubmission, blacklistReason, subSettings, subredditName){
    log.info(`[${subredditName}]`, 'Removing as blacklisted:', await printSubmission(submission), ', as blacklisted. Root blacklisted submission: ', await printSubmission(lastSubmission));
    const permalink = 'https://www.reddit.com' + await lastSubmission.permalink;
    const removalReason = outdent
        `Your post has been removed because it is a repost of [this image](${await lastSubmission.url}) posted [here](${permalink}), and that post was removed because:

        ${blacklistReason}`;
    removePost(reddit, submission, removalReason, subSettings);
}


async function getRemovalReason(modComment, subredditName) {
    const body = await modComment.body;   
    const startRemoval = '[](#start_removal)';
    const endRemoval = '[](#end_removal';

    if (!body.includes(startRemoval) || !body.includes(endRemoval) ) {
        log.info(chalk.magenta("Moderator comment doesn't include correct bookend tags", `[${subredditName}]`, ));
        return null;
    }

    return body.substring(body.indexOf(startRemoval) + startRemoval.length, body.lastIndexOf(endRemoval));
}


module.exports = {
    removeBlacklisted,
};