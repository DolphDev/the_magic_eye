// standard modules
const outdent = require('outdent');
require('dotenv').config();
const log = require('loglevel');
log.setLevel(process.env.LOG_LEVEL ? process.env.LOG_LEVEL : 'info');

// reddit modules
const chalk = require('chalk');

async function getModComment(reddit, submissionId) {
    const submission = reddit.getSubmission(submissionId);
    const comments = await submission.comments;
    return comments.find(comment => comment.distinguished === 'moderator' && comment.removed != true && comment.author !== 'AutoModerator');
}

async function isMagicIgnore(modComment) {
    return modComment != null && (await modComment.body).includes('[](#magic_ignore)'); // mod wants removal ignored
}

async function isRepostRemoval(modComment) {
    return modComment != null && (await modComment.body).includes('[](#repost)'); // mod has told them to resubmit an altered/cropped version
}

function sliceSubmissionId(submissionId) {
    return submissionId.slice(3, submissionId.length); // id is prefixed with "id_"
}

async function removePost(reddit, submission, removalReason, subSettings) {
    const footerText = subSettings.customFooter ? subSettings.customFooter : "*I'm a bot so if I was wrong, reply to me and a moderator will check it.*";
    const removalFooter = 
    outdent`
    

    -----------------------

    ${footerText}`;
    
    submission.remove();
    const replyable = await submission.reply(removalReason + removalFooter);
    replyable.distinguish();
}

async function printSubmission(submission) {
    const username = (await submission.author) ? (await submission.author.name) : null;
    const idForLog = await submission.id;
    return `http://redd.it/${idForLog} by ${username}`;
}


module.exports = {
    getModComment,
    isMagicIgnore,
    isRepostRemoval,
    sliceSubmissionId,
    removePost,
    printSubmission,
};