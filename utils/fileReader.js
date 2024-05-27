import fs from "fs";

export const fileReader = (path) => {
    try {
        return fs.readFileSync(path, 'utf8').trim().split('\n');
    } catch (error) {
        console.error("Error reading file:", error);
        return error;
    }
}