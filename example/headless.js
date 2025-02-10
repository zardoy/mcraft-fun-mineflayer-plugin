const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
// const pathToFfmpeg = require('ffmpeg-static') // install ffmpeg-static if you dont have ffmpeg in path

async function startStreaming(output = 'output.mp4', logFFMPEG = true, fps = 50) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    const WIDTH = 1920;
    const HEIGHT = 1080;

    // Set viewport to 1920x1080 (Full HD)
    await page.setViewport({
        width: WIDTH,
        height: HEIGHT,
        deviceScaleFactor: 1
    });

    // Listen for console messages
    page.on('console', msg => console.log('Browser console:', msg.text()));

    // Listen for page errors
    page.on('pageerror', error => {
        console.error('Page error:', error.message);
    });

    // Listen for request failures
    page.on('requestfailed', request => {
        console.error('Request failed:', request.url(), request.failure().errorText);
    });

    let ffmpegProcess = null;
    try {
        await page.goto('https://s.mcraft.fun/?viewerConnect=ws://localhost:25588');
        await page.waitForSelector('canvas');

        const rtmpOutput = output.startsWith('rtmp://');
        const ffmpegOutput = output.endsWith('.mp4');

        // const FFMPEG = pathToFfmpeg;
        const FFMPEG = 'ffmpeg';
        if (rtmpOutput) {
            const fps = 20;
            const gop = fps * 2;
            const gopMin = fps;
            const probesize = '42M';
            const cbr = '3000k';
            const threads = 4;

            const args = [
                '-y',
                '-f', 'image2pipe',
                '-r', fps.toString(),
                '-probesize', probesize,
                '-i', 'pipe:0',
                '-f', 'flv',
                '-ac', '2',
                '-ar', '44100',
                '-vcodec', 'libx264',
                '-g', gop.toString(),
                '-keyint_min', gopMin.toString(),
                '-b:v', cbr,
                '-minrate', cbr,
                '-maxrate', cbr,
                '-pix_fmt', 'yuv420p',
                '-s', `${WIDTH}x${HEIGHT}`,
                '-preset', 'ultrafast',
                '-tune', 'film',
                '-threads', threads.toString(),
                '-strict', 'normal',
                '-bufsize', cbr,
                output
            ];

            ffmpegProcess = spawn(FFMPEG, args);
        } else if (ffmpegOutput) {
            ffmpegProcess = spawn(FFMPEG, [
                '-y',
                '-f', 'image2pipe',
                '-i', 'pipe:0',
                output
            ]);
        }

        if (ffmpegProcess && logFFMPEG) {
            ffmpegProcess.stdout.on('data', (data) => {
                console.log(`FFmpeg stdout: ${data}`);
            });

            ffmpegProcess.stderr.on('data', (data) => {
                console.error(`FFmpeg stderr: ${data}`);
            });
        }

        await page.evaluate(() => {
            // hook into js on the webapp
        })

        // Start the streaming loop
        while (ffmpegProcess) {
            const screenshot = await page.screenshot({
                type: 'jpeg',
                quality: 80
            });

            if (ffmpegProcess.stdin.writable) {
                ffmpegProcess.stdin.write(screenshot);
            }

            // Wait for next frame
            await new Promise(resolve => setTimeout(resolve, 1000 / fps));
        }

    } catch (error) {
        console.error('Script error:', error);
    } finally {
        if (ffmpegProcess) {
            ffmpegProcess.stdin.end();
            ffmpegProcess.kill();
        }
        await browser.close();
    }
}

// Start streaming with either RTMP or MP4 output
startStreaming('output.mp4');  // For MP4 file
// or
// startStreaming('rtmp://your-streaming-endpoint');  // For RTMP streaming
