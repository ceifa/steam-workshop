const { extractGma } = require('./gma');
const { URLSearchParams } = require('url');
const steamworks = require('steamworks.js');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getAppIdFromWorkshopItemId = async (itemId) => {
    const params = new URLSearchParams({
        itemcount: 1,
        'publishedfileids[0]': itemId,
    })
    const fetchResult = await fetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString()
    });

    if (fetchResult.status !== 200) {
        throw new Error(`Failed to get workshop item details: ${fetchResult.status}`);
    }

    const { response } = await fetchResult.json()
    if (response.result !== 1) {
        throw new Error(`This workshop item was not found: ${response.result}`);
    }

    const { publishedfiledetails: [{ consumer_app_id: appId }] } = response;
    return appId;
}

const download = async (itemId, outputPath) => {
    const appId = await getAppIdFromWorkshopItemId(itemId);
    const client = steamworks.init(appId);

    const state = client.workshop.state(itemId)
    if (state & 4) {
        console.log('Item is already installed');
    } else {
        console.log('Item is not installed, downloading it...');
        client.workshop.download(itemId);

        while (true) {
            const downloadinfo = client.workshop.downloadInfo(itemId)
            if (downloadinfo.current >= downloadinfo.total) {
                break;
            }

            console.log(`Downloading ${downloadinfo.current}/${downloadinfo.total}`);
            await sleep(100);
        }
    }

    console.log('Download finished');
    const installinfo = client.workshop.installInfo(itemId)

    const files = await fs.promises.readdir(installinfo.folder)
    const file = path.resolve(installinfo.folder, files[0])
    if (file.endsWith('.gma')) {
        console.log('Extracting GMA...');
        await extractGma(file, outputPath)
    } else {
        await fs.promises.copyFile(installinfo.folder, outputPath);
    }

    console.log('Done');
}

module.exports = { download };