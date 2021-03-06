require('dotenv').config();
const chalk = require('chalk');
const MongoClient = require('mongodb').MongoClient;
const log = require('loglevel');
log.setLevel(process.env.LOG_LEVEL ? process.env.LOG_LEVEL : 'info');

let masterConnection = null;

class MasterProperty {
    _id;
    value;

    constructor(name, value) {
        this._id = name;
        this.value = value;
    }
}

// mod editable settings
class SubredditSettings {
    _id; // subreddit name
    config; // private config settings
    settings; // default settings

    constructor(subredditName) {
        this._id = subredditName;

        this.config = {
            firstTimeInit: false,
            databaseUrl: null,
            reportUnmoderatedTime: 0,
        }
        
        this.settings = {
            similarityTolerance: 6,            
            removeReposts: {
                smallScore: 0,
                smallScoreRepostDays: 15,
                mediumScore: 400,
                mediumScoreRepostDays: 25,
                largeScore: 10000,
                largeScoreRepostDays: 50,
                topScore: 999999999,
            },
            removeBrokenImages: {}
        }
    }
}

function getCollectionName(collection) {
    const collectionPrefix = (process.env.NODE_ENV == 'production' ? '' : process.env.NODE_ENV + ':');
    return collectionPrefix + collection;
}

async function getSubredditSettingsCollection() {
    return masterConnection.collection(getCollectionName('subreddit-settings'));
}

async function getPropertyCollection() {
    return masterConnection.collection(getCollectionName('properties'));
}

async function setSubredditSettings(subredditName, settings) {   
    try {
        log.debug(chalk.yellow("Inserting subreddit settings for:"), subredditName);
        const collection = await getSubredditSettingsCollection();
        await collection.save(settings);
    } catch (err) {
        log.error(chalk.red('MongoDb error:'), err);
        return null;
    }
}

async function getSubredditSettings(subredditName) {
    try {
        const collection = await getSubredditSettingsCollection();
        const property = (await collection.findOne({'_id': subredditName}));
        if (property != null) {
            return property;
        }
    } catch (err) {
        log.error(chalk.red('MongoDb error:'), err);
    }
    return null;
}

async function setMasterProperty(key, value) {
    try {
        log.debug(chalk.yellow("inserting master property. key:"), key, Array.isArray(value) ? (chalk.yellow('size: ') + value.length) : (chalk.yellow('value: ') + value));
        const collection = await getPropertyCollection();
        const newMasterProp = new MasterProperty(key, value);
        await collection.save(newMasterProp);
    } catch (err) {
        log.error(chalk.red('MongoDb error:'), err);
        return null;
    }
}

async function getMasterProperty(key) {
    try {
        const collection = await getPropertyCollection();
        const property = (await collection.findOne({'_id': key}));
        if (property != null) {
            return property.value;
        }
    } catch (err) {
        log.error(chalk.red('MongoDb error:'), err);
    }
    return null;
}


async function initMasterDatabase() {
    log.info(chalk.blue('Connecting to master database...'));
    try {
        const client = await MongoClient.connect(process.env.MONGODB_URI, { useNewUrlParser: true });
        masterConnection = await client.db();
    } catch (err) {
        log.error(chalk.red('Fatal MongoDb connection error for master database:'), err);
        return null;
    }
    return true;
}

async function refreshDatabaseList() {
    try {
        const masterDatabaseUrls = process.env.EXTERNAL_DATABASES.split(',');
        let databaseList = await getMasterProperty('databases');
        if (!databaseList) {
            log.info('First time external database config...');
            databaseList = {};
        }
        for (const masterDatabaseUrl of masterDatabaseUrls) {
            if (!databaseList[masterDatabaseUrl]) {
                log.info('Adding new database url: ', masterDatabaseUrl);
                databaseList[masterDatabaseUrl] = {
                    url: masterDatabaseUrl,
                    count: 0
                };
                await setMasterProperty('databases', databaseList);
            }
        } 
    } catch (err) {
        log.error(chalk.red('Error: could not refresh database list'), err);
        return null;
    }
}


module.exports = {
    SubredditSettings,
    initMasterDatabase,
    refreshDatabaseList,
    setSubredditSettings,
    getSubredditSettings,
    getMasterProperty,
    setMasterProperty,
};