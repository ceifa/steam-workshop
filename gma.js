const fs = require('fs');
const path = require('path');

const mkdirp = async (dir) => {
    if (fs.existsSync(dir)) { return; }
    const dirname = path.dirname(dir)
    await mkdirp(dirname);
    await fs.promises.mkdir(dir);
}

const extractGma = async (gmaPath, outputPath) => {
    const buffer = await fs.promises.readFile(gmaPath);

    let pointer = 4 + 1 + 8 + 8;
    const getStringSize = () => {
        for (var i = pointer; i < buffer.length - 1; i++) {
            if (buffer[i] === 0) {
                return i - pointer + 1;
            }
        }
    }

    const size = getStringSize();
    let unusedString = buffer.slice(pointer, pointer + size)
    pointer += size;

    while (unusedString.toString('utf-8') === '') {
        const size = getStringSize();
        unusedString = buffer.slice(pointer, pointer + size);
        pointer += size;
    }

    pointer += getStringSize();
    pointer += getStringSize();
    pointer += getStringSize();
    pointer += 4;

    const files = []
    while (buffer.readUIntLE(pointer, 4) !== 0) {
        pointer += 4;
        const size = getStringSize();
        const file = buffer.slice(pointer, pointer + size - 1).toString('utf-8');
        pointer += size;

        const fsize = buffer.readBigInt64LE(pointer);
        pointer += 8;
        pointer += 4;

        files.push({ file, size: fsize });
    }

    pointer += 4;

    for (const file of files) {
        const content = buffer.slice(pointer, pointer + Number(file.size)).toString('utf-8');
        pointer += Number(file.size);

        await mkdirp(path.dirname(path.resolve(outputPath, file.file)), { resursive: true });
        await fs.promises.writeFile(path.resolve(outputPath, file.file), content);
    }
}

module.exports = { extractGma };