const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { default: Store } = require('electron-store');
const chokidar = require('chokidar');
const { existsSync, mkdirSync, readdirSync, watch, rmSync } = require('fs');
const path = require('path');
const { spawn }  = require('child_process');

let WINDOW = null;

function logger(data)
{
    if (WINDOW === null) return;

    if (typeof(data) === 'string') WINDOW.webContents.send('ipc-addLog', `${'_'.repeat(20)} ${data} ${'_'.repeat(20)}`);
    else WINDOW.webContents.send('ipc-addLog', data.toString());
}

const watcher = chokidar.watch([]);

function getWatchList()
{
    const watchList = watcher.getWatched();
    const list = [];

    for (const folder in watchList) { watchList[folder].forEach(x => list.push(path.join(folder, x))); }

    return list;
}

watcher.on('change', (filepath) =>
{
    if (!config.get('watch')) return;

    logger(`File Change: ${filepath}`);

    WINDOW.webContents.send('ipc-fileChange');
});

const cmd = spawn('cmd.exe', [], {shell: true});
cmd.stderr.on('data', logger);
cmd.stdout.on('data', logger);

const config = new Store();
config.path = path.join(__dirname, './config.json');

if (!existsSync(path.join(__dirname, './config.json')))
{
    config.store =
    {
        OSSCADSuiteFolder: '',
        projectFolder: '',
        flash: false,
        watch: false,
        files: { v: '', cst: '' }
    };
}

ipcMain.on('ipc-minimize', () => WINDOW.minimize());
ipcMain.on('ipc-close', () => WINDOW.close());
ipcMain.on('ipc-openInBrowser', (E, url) => shell.openExternal(url));
ipcMain.on('ipc-ready', () =>
{
    const osscad = config.get('OSSCADSuiteFolder');

    WINDOW.webContents.send('ipc-setOSSCADSuiteFolder', config.get('OSSCADSuiteFolder'));
    WINDOW.webContents.send('ipc-setProjectFolder', config.get('projectFolder'));
    WINDOW.webContents.send('ipc-setFlash', config.get('flash'));
    WINDOW.webContents.send('ipc-setWatch', config.get('watch'));

    if (osscad?.length > 0)
    {
        cmd.stdin.write(`cd /d ${osscad}\n`);
        cmd.stdin.write('environment.bat\n');
    }
});

ipcMain.on('ipc-selectOSSCADSuiteFolder', () =>
{
    const location = dialog.showOpenDialogSync(WINDOW, {title: 'Select folder', properties: ['openDirectory']});

    if (location === undefined) return;

    config.set('OSSCADSuiteFolder', location[0]);

    cmd.stdin.write(`cd /d ${location[0]}\n`);
    cmd.stdin.write('environment.bat\n');

    WINDOW.webContents.send('ipc-setOSSCADSuiteFolder', location[0]);
});

ipcMain.on('ipc-selectProjectFolder', () =>
{
    const location = dialog.showOpenDialogSync(WINDOW, {title: 'Select folder', properties: ['openDirectory']});

    if (location === undefined) return;

    WINDOW.webContents.send('ipc-setProjectFolder', location[0]);
});

ipcMain.handle('ipc-detectFiles', (E, folder) =>
{
    try
    {
        const files = readdirSync(folder);
        
        const v = files.filter(x => x.endsWith('.v'))[0] || '';
        const cst = files.filter(x => x.endsWith('.cst'))[0] || '';

        config.set('projectFolder', folder);
        config.set('files.v', v);
        config.set('files.cst', cst);

        if ((v.length > 0) && (cst.length > 0))
        {
            getWatchList().forEach(x => watcher.unwatch(x));
            
            watcher.add([path.join(folder, v), path.join(folder, cst)]);
        }

        return { v, cst };

    } catch (error) { return {} }
});

ipcMain.on('ipc-flashWatch', (E, {flash, watch}) =>
{
    if (flash === undefined || watch === undefined) return;

    if (flash !== config.get('flash'))
    {
        if (flash) logger('Bitstreams will be uploaded to Flash memory');
        else logger('Bitstreams will be uploaded to SRAM');

        config.set('flash', flash);
    }

    if (watch !== config.get('watch'))
    {
        if (watch) logger('Changes to files will trigger a Build & Upload');
        else logger('Changes to files will trigger nothing');

        config.set('watch', watch);
    }
});

ipcMain.on('ipc-softReset', () => cmd.stdin.write('openFPGALoader -b tangnano9k --reset\n'));

let busy = false;

function waitForFile(file, cooldown)
{
    return new Promise((resolve) =>
    {
        const filepath = path.join(config.get('projectFolder'), 'build/', file);

        if (existsSync(filepath)) return resolve(true);

        if (!cooldown) setTimeout(() => resolve(false), 10 * 1000);

        const dir = path.dirname(filepath);

        const watcher = watch(dir, (E, changed) =>
        {
            if (changed === path.basename(filepath) && existsSync(filepath))
            {
                watcher.close();
                resolve(true);
            }
        });
    });
}

async function build()
{
    if (!(config.get('files.v').length > 0 && config.get('files.cst').length > 0)) return;

    cmd.stdin.write(`cd /d ${config.get('projectFolder')}\n`);

    const buildPath = `${config.get('projectFolder')}\\build\\`;

    rmSync(buildPath, {force: true, recursive: true});    
    mkdirSync(buildPath);

    logger('START SYNTHESIS');
    cmd.stdin.write(`yosys -p "synth_gowin -json build/synth.json" ${config.get('files.v')}\n`);
    if (!await waitForFile('synth.json')) return logger('CHECK LOGS | PROBABLY ERROR');
    logger('END SYNTHESIS');
    logger('START ROUTING');
    cmd.stdin.write(`nextpnr-himbaechel --write build/pnr.json --device GW1NR-LV9QN88PC6/I5 --json build/synth.json --vopt cst=${config.get('files.cst')} --vopt family=GW1N-9C\n`);
    if (!await waitForFile('pnr.json')) return logger('CHECK LOGS | PROBABLY ERROR');
    logger('END ROUTING');
    logger('START BITSTREAM');
    cmd.stdin.write(`gowin_pack -d GW1N-9C -o build/stream.fs build/pnr.json\n`);
    if (!await waitForFile('stream.fs')) return logger('CHECK LOGS | PROBABLY ERROR');
    logger('END BITSTREAM');

    return true;
}

async function upload()
{
    logger('START UPLOAD');
    cmd.stdin.write(`openFPGALoader -b tangnano9k build/stream.fs ${config.get('flash') ? '--write-flash' : ''} && type nul >build/dummy.file\n`);
    await waitForFile('dummy.file', false);
    logger('END UPLOAD');
}

ipcMain.on('ipc-build', async () =>
{
    if (busy) return;

    busy = true;

    await build();

    WINDOW.webContents.send('ipc-endProcess');

    busy = false;
});

ipcMain.on('ipc-build&upload', async () =>
{
    if (busy) return;

    busy = true;

    if (await build()) await upload();

    WINDOW.webContents.send('ipc-endProcess');
    
    busy = false;
});

app.on('ready', () =>
{
    WINDOW = new BrowserWindow
    ({
        resizable: false,
        frame: false,
        title: 'FPGA Toolkit',
        webPreferences:
        {
            webSecurity: false,
            preload: path.join(__dirname, 'preload.js'),
        }
    });

    if (process.argv.includes('--dev')) WINDOW.loadURL('http://localhost:7410');
    else WINDOW.loadFile(path.join(__dirname, './react/dist/index.html'));
});