// standard modules
require('dotenv').config();
const outdent = require('outdent');
const chalk = require('chalk');
const log = require('loglevel');
log.setLevel(process.env.LOG_LEVEL ? process.env.LOG_LEVEL : 'info');

async function processUnmoderated(submissions, settings, subredditName) {
    log.debug(`[${subredditName}]`, 'Retrived', submissions.length, ' top daily posts. Beginning to check for unmoderated.');
    let processedCount = 0;

    for (const submission of submissions) {
        let alreadyReported = submission.mod_reports && submission.mod_reports.length > 0;
        if (!submission.approved && !alreadyReported && submission.score > settings.reportUnmoderated.reportUnmoderatedScore) {
            submission.report({'reason': 'Unmoderated post - check for rules'});
        }
        processedCount++;
    }

    log.debug(chalk.blue('Processed', processedCount, ' top daily submissions for unmoderated.'));
}

module.exports = {
    processUnmoderated,
};