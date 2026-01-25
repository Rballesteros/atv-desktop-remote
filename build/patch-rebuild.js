const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'node_modules', '@electron', 'rebuild', 'lib', 'clang-fetcher.js');

if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes("import tar from 'tar'")) {
        content = content.replace("import tar from 'tar'", "import * as tar from 'tar'");
        fs.writeFileSync(file, content);
        console.log('Patched @electron/rebuild/lib/clang-fetcher.js for tar@7 compatibility');
    }
}
