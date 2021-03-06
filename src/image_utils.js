var parseDbUrl = require("parse-database-url");
var hammingDistance = require("hamming");
var dhashLibrary = require("./dhash_gen.js");
const chalk = require('chalk');
const { promisify } = require('util');
const dhashGet = promisify(dhashLibrary);
const fs = require('fs');
const imageDownloader = require('image-downloader');
const imageMagick = require('imagemagick');
const tesseract = require('tesseract.js');
const stripchar = require('stripchar').StripChar;
const fetch = require("node-fetch");
const imageSize = require('image-size');

const commonWords = require('./common_words.js').getCommonWords();

require('dotenv').config();
const log = require('loglevel');
log.setLevel(process.env.LOG_LEVEL ? process.env.LOG_LEVEL : 'info');


export async function generateDHash(imagePath, logUrl) {
    try {
        return await dhashGet(imagePath);
    } catch (e) {
        log.warn('Could not generate dhash for: ', logUrl, ', ', e);
        return null;
    }
}

export async function downloadImage(submissionUrl) {
    const options = {
        url: submissionUrl,
        dest: './tmp'
      }

    try {
        const { filename, image } = await imageDownloader.image(options);
        return filename;
    } catch (err) {
        log.warn("Error: Couldn't download image (probably deleted): ", submissionUrl)
        return null;
    }
}

export function deleteImage(imagePath) {
    fs.unlink(imagePath, (e) => {
        if (e) {
            log.error(chalk.red('Failed to delete file: '), imagePath, e);
        }
    });
}

export async function getImageUrl(submissionUrl) {
    let imageUrl = submissionUrl;
    if (imageUrl.endsWith('/')) {
        imageUrl = imageUrl.slice(0, imageUrl.length - 1);
    }

    const suffix = imageUrl.split('.')[imageUrl.split('.').length-1].split('?')[0];  // http://imgur.com/a/liD3a.gif?horrible=true
    const images = ['png', 'jpg', 'jpeg', 'bmp'];
    if (images.includes(suffix)) {
        return imageUrl;
    }

    const notImages = ['gif', 'gifv', 'mp4', 'mp4', 'webm', 'tiff', 'pdf', 'mov', 'mov', 'bmp']; 
    if (notImages.includes(suffix)) {
        return null; // fail fast
    }

    // http://i.imgur.com/f7VXJQF
    // http://imgur.com/mLkJuXP/
    // http://imgur.com/a/liD3a
    // http://imgur.com/gallery/HFoOCeg single image
    // https://imgur.com/gallery/5l71D album

    const isImgur = imageUrl.includes('imgur.com');
    if (isImgur) {
        let imgurHash = imageUrl.split('/')[imageUrl.split('/').length-1];  // http://imgur.com/S1dZBPm.weird?horrible=true
        imgurHash = imgurHash.split('.')[0];
        imgurHash = imgurHash.split('?')[0];
        const imgurClientId = '1317612995a5ccf';
        const options = {
            headers: {
                "Authorization": `Client-ID ${imgurClientId}`
            }
        };

        const isAlbum = imageUrl.includes('imgur.com/a/');
        const isGallery = imageUrl.includes('imgur.com/gallery/');
        if (isGallery || isAlbum) { 
            if (submissionUrl === 'http://redd.it/6f9umk') {
                log.info('isgallery')
            }
            const galleryResult = await fetch(`https://api.imgur.com/3/gallery/album/${imgurHash}/images`, options); // gallery album
            const galleryAlbum = await galleryResult.json();
            if (submissionUrl === 'http://redd.it/6f9umk') {
                log.info('galleryAlbum:', JSON.stringify(galleryAlbum))
            }            
            if (galleryAlbum.success && galleryAlbum.data && galleryAlbum.data.images && galleryAlbum.data.images[0] && galleryAlbum.data.images[0].type.startsWith('image')) {
                if (submissionUrl === 'http://redd.it/6f9umk') {
                    log.info('isgallery success')
                }
                return galleryAlbum.data.images[0].link;
            } else {
                if (submissionUrl === 'http://redd.it/6f9umk') {
                    log.info('isgallery signle image')
                }
                const imageResult = await fetch(`https://api.imgur.com/3/gallery/image/${imgurHash}`, options); // gallery but only one image
                const galleryImage = await imageResult.json();                
                if (galleryImage.success && galleryImage.data && galleryImage.data.type.startsWith('image') && !galleryImage.data.animated) {
                    if (submissionUrl === 'http://redd.it/6f9umk') {
                        log.info('isgallery signle image success')
                    }
                    return galleryImage.data.link;
                } else {
                    log.warn('Tried to parse this imgur album/gallery url but failed: ', imageUrl);
                    return null;
                }
            }
        } else {
            const result = await fetch(`https://api.imgur.com/3/image/${imgurHash}`, options); // single image
            const singleImage = await result.json();
            if (singleImage.success && singleImage.data.type.startsWith('image') && !singleImage.data.animated) {
                return singleImage.data.link;
            } else {
                log.warn('Tried to parse this imgur single image url but failed: ', imageUrl);
                return null;
            }
        }       
    }
        
    return null;
}

async function getImageDetails(submissionUrl, includeWords) {
    const imagePath = await downloadImage(submissionUrl);
    if (imagePath == null) {
        log.debug('download image stage failed');
        return null;
    }
    const imageDetails = { dhash: null, height: null, width: null, trimmedHeight: null, trimmedWidth: null, words: null };

    const imagePHash = await getImageSize(imagePath, submissionUrl); 
    if (imagePHash != null) {
        if (imagePHash.height > 5000 || imagePHash.width > 5000) {
            return { tooLarge: true };
        }

        imageDetails.height = imagePHash.height;
        imageDetails.width = imagePHash.width;
    } else {
        log.error('Failed to generate size for ', submissionUrl);
        return { ignore: true };
    }

    imageDetails.dhash = await generateDHash(imagePath, submissionUrl);

    if (imageDetails.dhash == null) {
        log.debug('dhash generate stage failed');
        return null; // must generate a dhash to be valid details
    }

    imageDetails.words = includeWords ? await getWordsInImage(imagePath, imagePHash.height) : [];

    try {
        const trimmedPath = imagePath + '_trimmed';
        await promisify(imageMagick.convert)([imagePath, '-trim', trimmedPath]);
        const trimmedPHash = await getImageSize(trimmedPath, submissionUrl);
        if (trimmedPHash != null) {
            imageDetails.trimmedHeight = trimmedPHash.height;
            imageDetails.trimmedWidth = trimmedPHash.width;
        } else {
            log.error('Failed to generate trimmed size for ', submissionUrl);
        }
        await deleteImage(trimmedPath);
    } catch (e) {
        log.error(chalk.red('Could not trim submission:'), submissionUrl, ' - imagemagick error: ', e);
    }

    await deleteImage(imagePath);
    return imageDetails;
}

async function getImageSize(path, submissionUrl) {
    try { 
        return imageSize(path);
    } catch (e) {
        log.error(chalk.red('Could not get imageSize for submission:'), submissionUrl, e);
        return null;
    }
}

async function getWordsInImage(originalImagePath, height) {
    try {
        // resize it first, issues with large images
        let imagePath = originalImagePath;
        const resizeImageFirst = height > 500;
        if (resizeImageFirst) {
            imagePath = originalImagePath + '-reduced';
            await promisify(imageMagick.convert)([originalImagePath, '-resize', '500', imagePath]); // maintains dimensions over exact size
        }

        const startTime = new Date().getTime();
        let result;
        log.debug(chalk.blue("Begin text detection in image:", imagePath));
        await tesseract.recognize(imagePath).then(data => result = data);
        const detectedStrings = result.words.map(word => stripchar.RSExceptUnsAlpNum(word.text.toLowerCase()));
        //log.debug(chalk.blue("Strings detected in image:"), detectedStrings);
        const detectedWords = detectedStrings.filter(item => (item.length > 3 && commonWords.has(item)));
        log.debug(chalk.blue("Text detected in image:"), detectedWords);
        const endTime = new Date().getTime();
        const timeTaken = (endTime - startTime) / 1000;
        if (timeTaken > 20) {
            log.info(chalk.red('End text detection, took: '), timeTaken, 's to load ');
        }

        if (resizeImageFirst) {
            await deleteImage(imagePath);
        }

        return detectedWords;
    } catch (e) {
        log.error(chalk.red("Text detection error:"), e);
    }
    return [];
}

module.exports = {
    getImageDetails,
    getImageUrl
};    
