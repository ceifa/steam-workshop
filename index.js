const { extractGma } = require('./gma');
const { URLSearchParams } = require('url');
const steamworks = require('steamworks.js');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const lzma = require('lzma-native');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const slug = (str) => {
    return str
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/[-\s]+/g, '-');
}

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

    const { publishedfiledetails: [{ consumer_app_id: appId, title }] } = response;
    return { appId, title };
}

const download = async (itemId, outputPath) => {
    const { appId, title } = await getAppIdFromWorkshopItemId(itemId);
    outputPath = path.join(outputPath, `${itemId}-${slug(title)}`);
    const client = steamworks.init(appId);

    const state = client.workshop.state(itemId)
    if (state & 4 && !(state & 8)) {
        console.log('Item is already installed');
    } else {
        if (state & 8) {
            console.log('Item is already installed but needs to be updated');
        }

        console.log('Waiting for steam to start download...');
        client.workshop.download(itemId, true);

        while (true) {
            const state = client.workshop.state(itemId)
            if (state & 4) {
                console.log('\nDownload finished');
                break;
            } else if (state & 16) {
                const downloadinfo = client.workshop.downloadInfo(itemId)
                const progress = Math.floor(Number(downloadinfo.current) / Number(downloadinfo.total) * 100);
                const progressBar = '='.repeat(Math.floor(progress / 2));
                const progressBarRemainder = '-'.repeat(Math.floor((100 - progress) / 2));
                process.stdout.write(chalk.yellow(`[${progressBar}${progressBarRemainder}] ${progress}% (${downloadinfo.current}/${downloadinfo.total} bytes)\r`));
            }

            await sleep(100);
        }
    }

    const installinfo = client.workshop.installInfo(itemId)

    let gmaBuffer = undefined
    if (installinfo.folder.endsWith('.bin')) {
        const bufferPromise = new Promise(async (resolve) => {
            lzma.decompress(await fs.promises.readFile(installinfo.folder), undefined, resolve);
        })
        gmaBuffer = await bufferPromise;
    } else {
        const files = await fs.promises.readdir(installinfo.folder)
        const file = path.resolve(installinfo.folder, files[0])
        if (file.endsWith('.gma')) {
            gmaBuffer = await fs.promises.readFile(file)
        }
    }

    if (gmaBuffer) {
        let completed = false;
        extractGma(gmaBuffer, outputPath).then(() => {
            completed = true;
        })

        process.stdout.write('Extracting GMA');
        while (!completed) {
            process.stdout.write('.');
            await sleep(200);
        }
        process.stdout.write('\n');
    } else {
        await fs.promises.copyFile(installinfo.folder, outputPath);
    }

    console.log(chalk.green('Done!'));
    console.log(`${chalk.blueBright(title)} downloaded to ${chalk.blueBright(outputPath)}`);
}

module.exports = { download };