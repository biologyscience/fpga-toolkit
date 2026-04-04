import ReactDOM from 'react-dom/client';
import { useEffect, useState, useRef } from 'react';
import { RemoveRounded, LaunchRounded, CloseRounded } from '@mui/icons-material';

import './scss/customClasses.scss';
import './scss/customVariables.scss';
import './scss/styles.scss';

function ROW({ className, children, ...rest })
{
    return (
        <div className={className === undefined ? 'flexROW' : `flexROW ${className}`} {...rest}>
            {children}
        </div>
    )
}

function COL({ className, children, ...rest })
{
    return (
        <div className={className === undefined ? 'flexCOL' : `flexCOL ${className}`} {...rest}>
            {children}
        </div>
    )
}

function GRID({ className, children, ...rest })
{
    return (
        <div className={className === undefined ? 'grid' : `grid ${className}`} {...rest}>
            {children}
        </div>
    )
}

function Titlebar()
{
    return (
        <GRID id='titlebar'>
            <span>Sipeed - Tang Nano 9K Toolkit | Device: GW1NR-LV9QN88PC6/I5 | Family: GW1N-9C</span>
            <button className='minimize' onClick={() => window.ipc.send('ipc-minimize')}><RemoveRounded/></button>
            <button className='close' onClick={() =>  window.ipc.send('ipc-close')}><CloseRounded/></button>
        </GRID>
    )
}

function Main()
{
    const [loader, setLoader] = useState(false);
    const [projectFolder, setProjectFolder] = useState('');
    const [OSSCADSuiteFolder, setOSSCADSuiteFolder] = useState('');
    const [verilogFile, setVerilogFile] = useState();
    const [cstFile, setCstFile] = useState();
    const [flash, setFlash] = useState();
    const [watch, setWatch] = useState();
    const [logs, setLogs] = useState([]);

    const logsWrapper = useRef();

    useEffect(() =>
    {
        window.ipc.invoke('ipc-detectFiles', projectFolder).then(({v, cst}) =>
        {
            setVerilogFile(v);
            setCstFile(cst);
        });

    }, [projectFolder]);

    useEffect(() => 
    {
        window.ipc.send('ipc-flashWatch', {flash, watch});

    }, [flash, watch]);

    useEffect(() =>
    {
        logsWrapper.current.scrollTop = logsWrapper.current.scrollHeight;

    }, [logs]);
 
    useEffect(() =>
    {
        window.ipc.on('ipc-setOSSCADSuiteFolder', (folder) => setOSSCADSuiteFolder(folder));
        window.ipc.on('ipc-setProjectFolder', (folder) => setProjectFolder(folder));
        window.ipc.on('ipc-setFlash', (bool) => setFlash(bool));
        window.ipc.on('ipc-setWatch', (bool) => setWatch(bool));
        window.ipc.on('ipc-addLog', (line) => setLogs((oldLogs) => { const newLogs = [...oldLogs, line]; return newLogs; }));
        window.ipc.on('ipc-fileChange', () => { setLoader(true); window.ipc.send('ipc-build&upload'); });
        window.ipc.on('ipc-endProcess', () => setLoader(false));

        window.ipc.send('ipc-ready');
    }, []);

    return (
        <COL className={'main'}>
            <ROW className={'folder'}>
                <span>OSS CAD Suite Folder</span>
                <input disabled value={OSSCADSuiteFolder} onChange={({target}) => setOSSCADSuiteFolder(target.value)}/>
                <button onClick={() => window.ipc.send('ipc-selectOSSCADSuiteFolder')}><LaunchRounded/></button>
            </ROW>
            <ROW className={'folder'}>
                <span>Project Folder</span>
                <input value={projectFolder} onChange={({target}) => setProjectFolder(target.value)}/>
                <button onClick={() => window.ipc.send('ipc-selectProjectFolder')}><LaunchRounded/></button>
            </ROW>
            <ROW className={'files'}>
                <COL className={`type ${verilogFile?.length > 0 ? 'green' : 'red'}`}>
                    <span className='format'>Verilog (.v)</span>
                    <span className='overflowPrevent'>{verilogFile}</span>
                </COL>
                <div className={`loader ${loader ? 'show' : null}`}/>
                <COL className={`type ${cstFile?.length > 0 ? 'green' : 'red'}`}>
                    <span className='format'>Constraint (.cst)</span>
                    <span className='overflowPrevent'>{cstFile}</span>
                </COL>
            </ROW>
            <ROW className={'exec'}>
                <button onClick={() => window.ipc.send('ipc-softReset')}>Soft Reset</button>
                <button onClick={() => { setLoader(true); window.ipc.send('ipc-build'); }}>Build</button>
                <button onClick={() => { setLoader(true); window.ipc.send('ipc-build&upload'); }}>Build & Upload</button>
            </ROW>
            <ROW className={'options'}>
                <ROW className={'option'}>
                    <input type='checkbox' checked={flash} onChange={({target}) => setFlash(target.checked)}/>
                    <span>Flash</span>
                </ROW>
                <ROW className={'option'}>
                    <input type='checkbox' checked={watch} onChange={({target}) => setWatch(target.checked)}/>
                    <span>Watch Files</span>
                </ROW>
                <ROW className={'option'}>
                    <button onClick={() => setLogs([])}>Clear Logs</button>
                </ROW>
            </ROW>
            <COL className={'logs'}>
                <span className='title'>Logs</span>
                <COL ref={logsWrapper} className={'wrapper'}>
                    {logs.map((x, i) => <span key={i}>{x}</span>)}
                </COL>
            </COL>
            <ROW className={'footnote'}>
                <span onClick={() => window.ipc.send('ipc-openInBrowser', 'https://github.com/biologyscience/fpga-toolkit/blob/main/info/GET-STARTED.md#how-to-use')}>How to use</span>
                <span onClick={() => window.ipc.send('ipc-openInBrowser', 'https://github.com/biologyscience/fpga-toolkit/')}>View on GitHub</span>
            </ROW>
        </COL>
    )
}

ReactDOM.createRoot(document.body).render(
    <>
        <Titlebar/>
        <Main/>
    </>
);