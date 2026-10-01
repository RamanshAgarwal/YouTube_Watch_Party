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
            const element =
                document.getElementById("youtube-player");

            if (!element) {
                return;
            }

            if (playerRef.current) {
                playerRef.current.destroy();
                playerRef.current = null;
            }

            playerRef.current =
                new window.YT.Player(
                    "youtube-player",
                    {
                        videoId: videoId,

                        playerVars: {
                            controls:
                                role === "participant"
                                    ? 0
                                    : 1,
                            rel: 0
                        },

                        events: {
                            onReady: handleReady,
                            onStateChange:
                                handleStateChange
                        }
                    }
                );
        };

        if (window.YT) {
            createPlayer();
        } else {
            const script =
                document.createElement("script");

            script.src =
                "https://www.youtube.com/iframe_api";

            document.body.appendChild(script);

            window.onYouTubeIframeAPIReady =
                createPlayer;
        }

        return () => {
            playerReady.current = false;
            syncApplied.current = false;
            remoteAction.current = null;

            if (playerRef.current) {
                playerRef.current.destroy();
                playerRef.current = null;
            }
        };
    }, [videoId]);

    // --------------------------------
    // PLAYER READY
    // --------------------------------
    const handleReady = () => {
        console.log("YouTube Player Ready");

        playerReady.current = true;

        tryApplySync();
    };

    // --------------------------------
    // INITIAL ROOM SYNC
    // --------------------------------
    const tryApplySync = () => {
        if (!playerReady.current) {
            return;
        }

        if (!playerRef.current) {
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

        console.log(
            "Applying room sync:",
            syncTime,
            syncPlaying
        );

        remoteAction.current = "seek";

        lastTime.current = syncTime;

        playerRef.current.seekTo(
            syncTime,
            true
        );

        syncApplied.current = true;

        setTimeout(() => {
            if (!playerRef.current) {
                return;
            }

            if (syncPlaying) {
                remoteAction.current = "play";

                playerRef.current.playVideo();

                setTimeout(() => {
                    remoteAction.current = null;
                    lastTime.current =
                        getCurrentTime();

                    console.log(
                        "Remote Play completed"
                    );
                }, 500);
            } else {
                remoteAction.current = "pause";

                playerRef.current.pauseVideo();

                setTimeout(() => {
                    remoteAction.current = null;
                    lastTime.current =
                        getCurrentTime();

                    console.log(
                        "Remote Pause completed"
                    );
                }, 500);
            }
        }, 700);
    };

    useEffect(() => {
        tryApplySync();
    }, [
        syncTime,
        syncPlaying,
        role
    ]);

    // --------------------------------
    // STATE CHANGE
    // --------------------------------
    const handleStateChange = (event) => {
        playerState.current =
            event.data;

        // Remote action is being handled separately.
        if (remoteAction.current !== null) {
            return;
        }

        // Participant cannot control
        if (role === "participant") {
            return;
        }

        // HOST / MOD PLAY
        if (
            event.data ===
            window.YT.PlayerState.PLAYING
        ) {
            const currentTime =
                getCurrentTime();

            lastTime.current =
                currentTime;

            console.log(
                "Video Played:",
                currentTime
            );

            socket.emit(
                "video_play",
                currentTime
            );

            return;
        }

        // HOST / MOD PAUSE
        if (
            event.data ===
            window.YT.PlayerState.PAUSED
        ) {
            const currentTime =
                getCurrentTime();

            lastTime.current =
                currentTime;

            console.log(
                "Video Paused:",
                currentTime
            );

            socket.emit(
                "video_pause",
                currentTime
            );
        }
    };

    // --------------------------------
    // CURRENT TIME
    // --------------------------------
    const getCurrentTime = () => {
        if (
            playerRef.current &&
            playerRef.current.getCurrentTime
        ) {
            return playerRef.current
                .getCurrentTime();
        }

        return 0;
    };

    // --------------------------------
    // SEEK DETECTOR
    // --------------------------------
    useEffect(() => {
        if (role === "participant") {
            return;
        }

        let previousTime = null;

        const interval =
            setInterval(() => {
                if (
                    !playerReady.current ||
                    !playerRef.current
                ) {
                    return;
                }

                // Ignore changes caused by remote actions
                if (
                    remoteAction.current !== null
                ) {
                    previousTime =
                        getCurrentTime();

                    return;
                }

                const currentTime =
                    getCurrentTime();

                if (previousTime === null) {
                    previousTime =
                        currentTime;

                    return;
                }

                const difference =
                    Math.abs(
                        currentTime -
                        previousTime
                    );

                if (difference > 2) {
                    console.log(
                        "LOCAL SEEK DETECTED:",
                        currentTime
                    );

                    socket.emit(
                        "video_seek",
                        currentTime
                    );
                }

                previousTime =
                    currentTime;

            }, 200);

        return () => {
            clearInterval(interval);
        };

    }, [role]);

    // --------------------------------
    // REMOTE EVENTS
    // --------------------------------
    useEffect(() => {

        const handleRemotePlay = () => {
            if (
                !playerReady.current ||
                !playerRef.current
            ) {
                return;
            }

            console.log(
                "Received video_play"
            );

            remoteAction.current =
                "play";

            playerRef.current.playVideo();

            setTimeout(() => {
                if (!playerRef.current) {
                    return;
                }

                remoteAction.current = null;

                lastTime.current =
                    getCurrentTime();

                console.log(
                    "Remote Play completed"
                );
            }, 500);
        };

        const handleRemotePause = () => {
            if (
                !playerReady.current ||
                !playerRef.current
            ) {
                return;
            }

            console.log(
                "Received video_pause"
            );

            remoteAction.current =
                "pause";

            playerRef.current.pauseVideo();

            setTimeout(() => {
                if (!playerRef.current) {
                    return;
                }

                remoteAction.current = null;

                lastTime.current =
                    getCurrentTime();

                console.log(
                    "Remote Pause completed"
                );
            }, 500);
        };

        const handleRemoteSeek = (time) => {
            if (
                !playerReady.current ||
                !playerRef.current
            ) {
                return;
            }

            console.log(
                "Received video_seek:",
                time
            );

            remoteAction.current =
                "seek";

            lastTime.current =
                time;

            playerRef.current.seekTo(
                time,
                true
            );

            // Do not wait for YouTube's
            // PLAYING / PAUSED state event.
            setTimeout(() => {
                if (!playerRef.current) {
                    return;
                }

                remoteAction.current = null;

                lastTime.current =
                    getCurrentTime();

                console.log(
                    "Remote Seek completed:",
                    lastTime.current
                );
            }, 700);
        };

        socket.on(
            "video_play",
            handleRemotePlay
        );

        socket.on(
            "video_pause",
            handleRemotePause
        );

        socket.on(
            "video_seek",
            handleRemoteSeek
        );

        return () => {
            socket.off(
                "video_play",
                handleRemotePlay
            );

            socket.off(
                "video_pause",
                handleRemotePause
            );

            socket.off(
                "video_seek",
                handleRemoteSeek
            );
        };

    }, []);

    return (
        <div>
            <div
                id="youtube-player"
                style={{
                    width: "560px",
                    height: "315px"
                }}
            ></div>

            {role === "participant" && (
                <p>
                    👤 Participant -
                    Host or Moderator controls
                    playback.
                </p>
            )}
        </div>
    );
}

export default YouTubePlayer;