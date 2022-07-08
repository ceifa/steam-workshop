const fs = require('fs');
const lzma = require('lzma-native');
const path = require('path');

const mkdirp = async (dir) => {
    if (fs.existsSync(dir)) { return; }
    const dirname = path.dirname(dir)
    await mkdirp(dirname);
    await fs.promises.mkdir(dir);
}

/** @param buffer {Buffer} */
const extractGma = async (buffer, outputPath) => {
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
    while (buffer.length >= pointer + 4 && buffer.readUIntLE(pointer, 4) !== 0) {
        pointer += 4;
        const size = getStringSize();
        const file = buffer.slice(pointer, pointer + size - 1).toString('utf-8');
        pointer += size;

        const fsize = buffer.readBigInt64LE(pointer);
        pointer += 8;

        const crc = buffer.readUIntLE(pointer, 4);
        pointer += 4;

        files.push({ file, size: fsize, crc });
    }

    pointer += 4;

    for (const file of files) {
        const content = buffer.slice(pointer, pointer + Number(file.size));
        pointer += Number(file.size);

        if (file.crc !== lzma.crc32(content)) {
            throw new Error(`CRC32 mismatch for ${file.file}`);
        }

        await mkdirp(path.dirname(path.resolve(outputPath, file.file)), { resursive: true });
        await fs.promises.writeFile(path.resolve(outputPath, file.file), content);
    }
}

module.exports = { extractGma };