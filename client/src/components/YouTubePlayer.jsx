import { useEffect, useRef } from "react";
import socket from "../socket";

function YouTubePlayer({
    videoId,
    role,
    syncTime,
    syncPlaying
}) {
    const playerRef = useRef(null);
    const playerReady = useRef(false);
    const playerState = useRef(null);

    const remoteAction = useRef(null);
    const lastTime = useRef(0);
    const syncApplied = useRef(false);

    // --------------------------------
    // CREATE PLAYER
    // --------------------------------
    useEffect(() => {
        playerReady.current = false;
        syncApplied.current = false;
        remoteAction.current = null;
        lastTime.current = 0;

        const createPlayer = () => {
            const element = document.getElementById("youtube-player");

            if (!element) {
                return;
            }

            if (playerRef.current) {
                playerRef.current.destroy();
                playerRef.current = null;
            }

            playerRef.current = new window.YT.Player("youtube-player", {
                videoId: videoId,
                width: "100%",
                height: "100%",
                playerVars: {
                    controls: role === "participant" ? 0 : 1,
                    rel: 0,
                    modestbranding: 1,
                    autoplay: 1
                },
                events: {
                    onReady: handleReady,
                    onStateChange: handleStateChange
                }
            });
        };

        if (window.YT && window.YT.Player) {
            createPlayer();
        } else {
            const script = document.createElement("script");
            script.src = "https://www.youtube.com/iframe_api";
            document.body.appendChild(script);
            window.onYouTubeIframeAPIReady = createPlayer;
        }

        return () => {
            playerReady.current = false;
            syncApplied.current = false;
            remoteAction.current = null;

            if (playerRef.current) {
                try {
                    playerRef.current.destroy();
                } catch (e) {
                    // Ignore destruction edge case errors
                }
                playerRef.current = null;
            }
        };
    }, [videoId,role]);

    // --------------------------------
    // PLAYER READY
    // --------------------------------
    const handleReady = () => {
        console.log("🎬 YouTube Player Ready");
        playerReady.current = true;
        tryApplySync();
    };

    // --------------------------------
    // INITIAL ROOM SYNC
    // --------------------------------
    const tryApplySync = () => {
        if (!playerReady.current || !playerRef.current) {
            return;
        }

        if (role !== "participant") {
            return;
        }

        if (syncApplied.current) {
            return;
        }

        if (typeof syncTime !== "number") {
            return;
        }

        console.log("🔄 Applying initial room sync:", syncTime, "Playing:", syncPlaying);

        remoteAction.current = "seek";
        lastTime.current = syncTime;

        playerRef.current.seekTo(syncTime, true);
        syncApplied.current = true;

        setTimeout(() => {
            if (!playerRef.current) return;

            if (syncPlaying) {
                remoteAction.current = "play";
                playerRef.current.playVideo();

                setTimeout(() => {
                    remoteAction.current = null;
                    lastTime.current = getCurrentTime();
                }, 500);
            } else {
                remoteAction.current = "pause";
                playerRef.current.pauseVideo();

                setTimeout(() => {
                    remoteAction.current = null;
                    lastTime.current = getCurrentTime();
                }, 500);
            }
        }, 700);
    };

    useEffect(() => {
        tryApplySync();
    }, [syncTime, syncPlaying, role]);

    // --------------------------------
    // STATE CHANGE HANDLER
    // --------------------------------
    const handleStateChange = (event) => {
        playerState.current = event.data;

        // Remote action is being processed
        if (remoteAction.current !== null) {
            return;
        }

        // Participant cannot emit control events
        if (role === "participant") {
            return;
        }

        // HOST / MOD PLAY
        if (event.data === window.YT.PlayerState.PLAYING) {
            const currentTime = getCurrentTime();
            lastTime.current = currentTime;
            console.log("▶ Local Video Played:", currentTime);
            socket.emit("video_play", currentTime);
            return;
        }

        // HOST / MOD PAUSE
        if (event.data === window.YT.PlayerState.PAUSED) {
            const currentTime = getCurrentTime();
            lastTime.current = currentTime;
            console.log("⏸ Local Video Paused:", currentTime);
            socket.emit("video_pause", currentTime);
        }
    };

    // Helper to extract current time
    const getCurrentTime = () => {
        if (playerRef.current && typeof playerRef.current.getCurrentTime === "function") {
            return playerRef.current.getCurrentTime();
        }
        return 0;
    };

    // --------------------------------
    // SEEK DETECTOR (HOST / MOD)
    // --------------------------------
    useEffect(() => {
        if (role === "participant") {
            return;
        }

        let previousTime = null;

        const interval = setInterval(() => {
            if (!playerReady.current || !playerRef.current) {
                return;
            }

            if (remoteAction.current !== null) {
                previousTime = getCurrentTime();
                return;
            }

            const currentTime = getCurrentTime();

            if (previousTime === null) {
                previousTime = currentTime;
                return;
            }

            const difference = Math.abs(currentTime - previousTime);

            if (difference > 2) {
                console.log("⏩ Local Seek Detected:", currentTime);
                socket.emit("video_seek", currentTime);
            }

            previousTime = currentTime;
        }, 200);

        return () => {
            clearInterval(interval);
        };
    }, [role]);

    // --------------------------------
    // REMOTE SOCKET EVENT HANDLERS
    // --------------------------------
    useEffect(() => {
        const handleRemotePlay = () => {
            if (!playerReady.current || !playerRef.current) return;
            console.log("⚡ Received remote video_play");

            remoteAction.current = "play";
            playerRef.current.playVideo();

            setTimeout(() => {
                if (!playerRef.current) return;
                remoteAction.current = null;
                lastTime.current = getCurrentTime();
            }, 500);
        };

        const handleRemotePause = () => {
            if (!playerReady.current || !playerRef.current) return;
            console.log("⚡ Received remote video_pause");

            remoteAction.current = "pause";
            playerRef.current.pauseVideo();

            setTimeout(() => {
                if (!playerRef.current) return;
                remoteAction.current = null;
                lastTime.current = getCurrentTime();
            }, 500);
        };

        const handleRemoteSeek = (time) => {
            if (!playerReady.current || !playerRef.current) return;
            console.log("⚡ Received remote video_seek:", time);

            remoteAction.current = "seek";
            lastTime.current = time;

            playerRef.current.seekTo(time, true);

            setTimeout(() => {
                if (!playerRef.current) return;
                remoteAction.current = null;
                lastTime.current = getCurrentTime();
            }, 700);
        };

        socket.on("video_play", handleRemotePlay);
        socket.on("video_pause", handleRemotePause);
        socket.on("video_seek", handleRemoteSeek);

        return () => {
            socket.off("video_play", handleRemotePlay);
            socket.off("video_pause", handleRemotePause);
            socket.off("video_seek", handleRemoteSeek);
        };
    }, []);

    return (
        <div className="relative w-full h-full min-h-[300px] sm:min-h-[420px] bg-black overflow-hidden flex items-center justify-center">
            <div id="youtube-player" className="w-full h-full absolute inset-0"></div>
        </div>
    );
}

export default YouTubePlayer;