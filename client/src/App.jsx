import { useEffect, useState } from "react";
import socket from "./socket";
import YouTubePlayer from "./components/YouTubePlayer";

function App() {
    const [roomId, setRoomId] = useState("");
    const [joinRoomId, setJoinRoomId] = useState("");
    const [createdRoom, setCreatedRoom] = useState("");

    const [username, setUsername] = useState("");
    const [myRole, setMyRole] = useState("");

    const [participants, setParticipants] = useState([]);

    const [videoUrl, setVideoUrl] = useState("");
    const [videoId, setVideoId] = useState("");

    const [syncTime, setSyncTime] = useState(null);
    const [syncPlaying, setSyncPlaying] = useState(false);

    useEffect(() => {
        const handleConnect = () => {
            console.log("Connected to server:", socket.id);
        };

        const handleRoomCreated = (roomId) => {
            console.log("Room created:", roomId);
            setCreatedRoom(roomId);
            setMyRole("host");
            setSyncTime(null);
            setSyncPlaying(false);
        };

        const handleRoomJoined = (roomId) => {
            console.log("Joined room:", roomId);
        };

        const handleSyncState = (state) => {
            console.log("Received sync state:", state);

            if (state.role) {
                setMyRole(state.role);
            }

            if (state.videoId) {
                setVideoId(state.videoId);
            } else {
                setVideoId("");
            }

            if (typeof state.currentTime === "number") {
                setSyncTime(state.currentTime);
            }

            if (typeof state.isPlaying === "boolean") {
                setSyncPlaying(state.isPlaying);
            }
        };

        const handleVideoLoaded = (newVideoId) => {
            console.log("Video received from room:", newVideoId);
            setVideoId(newVideoId);
            setSyncTime(0);
            setSyncPlaying(false);
        };

        const handleParticipantsUpdated = (updatedParticipants) => {
            console.log("Participants:", updatedParticipants);
            setParticipants(updatedParticipants);
        };

        const handleRoleUpdated = (role) => {
            console.log("My role updated:", role);
            setMyRole(role);
        };

        const handlePermissionDenied = (message) => {
            alert(message);
        };

        const handleParticipantRemoved = () => {
            alert("You have been removed from the room.");
            setMyRole("");
            setVideoId("");
            setSyncTime(null);
            setSyncPlaying(false);
            setParticipants([]);
        };

        const handleRoomError = (message) => {
            alert(message);
        };

        socket.on("connect", handleConnect);
        socket.on("room_created", handleRoomCreated);
        socket.on("room_joined", handleRoomJoined);
        socket.on("sync_state", handleSyncState);
        socket.on("video_loaded", handleVideoLoaded);
        socket.on("participants_updated", handleParticipantsUpdated);
        socket.on("role_updated", handleRoleUpdated);
        socket.on("permission_denied", handlePermissionDenied);
        socket.on("participant_removed", handleParticipantRemoved);
        socket.on("room_error", handleRoomError);

        return () => {
            socket.off("connect", handleConnect);
            socket.off("room_created", handleRoomCreated);
            socket.off("room_joined", handleRoomJoined);
            socket.off("sync_state", handleSyncState);
            socket.off("video_loaded", handleVideoLoaded);
            socket.off("participants_updated", handleParticipantsUpdated);
            socket.off("role_updated", handleRoleUpdated);
            socket.off("permission_denied", handlePermissionDenied);
            socket.off("participant_removed", handleParticipantRemoved);
            socket.off("room_error", handleRoomError);
        };
    }, []);

    const createRoom = () => {
        if (!username.trim()) {
            alert("Enter your username first");
            return;
        }

        if (!roomId.trim()) {
            alert("Enter Room ID");
            return;
        }

        socket.emit("create_room", {
            roomId: roomId.trim(),
            username: username.trim()
        });
    };

    const joinRoom = () => {
        if (!username.trim()) {
            alert("Enter your username first");
            return;
        }

        if (!joinRoomId.trim()) {
            alert("Enter Room ID");
            return;
        }

        socket.emit("join_room", {
            roomId: joinRoomId.trim(),
            username: username.trim()
        });
    };

    const loadVideo = () => {
        if (myRole === "participant") {
            alert("Participants cannot change the video.");
            return;
        }

        if (!videoUrl.trim()) {
            alert("Enter YouTube URL");
            return;
        }

        try {
            const url = new URL(videoUrl);
            const id = url.searchParams.get("v");

            if (!id) {
                alert("Invalid YouTube URL");
                return;
            }

            setVideoId(id);
            setSyncTime(0);
            setSyncPlaying(false);

            socket.emit("load_video", id);
        } catch (error) {
            alert("Invalid YouTube URL");
        }
    };

    const makeModerator = (userId) => {
        socket.emit("assign_role", {
            userId,
            role: "moderator"
        });
    };

    const makeParticipant = (userId) => {
        socket.emit("assign_role", {
            userId,
            role: "participant"
        });
    };

    const removeParticipant = (userId) => {
        socket.emit("remove_participant", userId);
    };

    const copyRoomId = async () => {
        const room = createdRoom || joinRoomId;

        if (!room) {
            return;
        }

        try {
            await navigator.clipboard.writeText(room);
            alert("Room ID copied!");
        } catch (error) {
            console.log("Copy failed");
        }
    };

    const getRoleLabel = (role) => {
        if (role === "host") return "Host";
        if (role === "moderator") return "Moderator";
        return "Participant";
    };

    const getRoleStyle = (role) => {
        if (role === "host") {
            return "border-amber-400/20 bg-amber-400/10 text-amber-300";
        }

        if (role === "moderator") {
            return "border-violet-400/20 bg-violet-400/10 text-violet-300";
        }

        return "border-slate-400/15 bg-slate-400/10 text-slate-300";
    };

    const getRoleIcon = (role) => {
        if (role === "host") return "👑";
        if (role === "moderator") return "🛡️";
        return "👤";
    };

    const activeRoom = createdRoom || joinRoomId;

    return (
        <div className="min-h-screen bg-[#05070d] text-slate-100">

            {/* Background atmosphere */}
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute left-[-180px] top-[-180px] h-[520px] w-[520px] rounded-full bg-indigo-600/10 blur-[140px]" />
                <div className="absolute right-[-200px] top-[25%] h-[500px] w-[500px] rounded-full bg-violet-600/10 blur-[140px]" />
                <div className="absolute bottom-[-220px] left-[30%] h-[500px] w-[500px] rounded-full bg-fuchsia-600/5 blur-[140px]" />
            </div>

            {/* TOP NAV */}
            <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#05070d]/85 backdrop-blur-2xl">
                <div className="mx-auto flex h-[72px] max-w-[1500px] items-center justify-between px-4 sm:px-6 lg:px-8">

                    <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/20">
                            <span className="text-sm font-black">▶</span>
                        </div>

                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-sm font-black tracking-tight">
                                    WatchParty
                                </h1>

                                <span className="rounded-md border border-indigo-400/15 bg-indigo-400/10 px-1.5 py-0.5 text-[8px] font-black tracking-widest text-indigo-300">
                                    LIVE
                                </span>
                            </div>

                            <p className="hidden text-[10px] text-slate-600 sm:block">
                                Synchronized YouTube rooms
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-4">

                        {activeRoom && (
                            <div className="hidden items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2 sm:flex">
                                <div>
                                    <p className="text-[8px] font-black uppercase tracking-[0.16em] text-slate-600">
                                        Room
                                    </p>

                                    <p className="font-mono text-xs font-bold text-slate-300">
                                        {activeRoom}
                                    </p>
                                </div>

                                <button
                                    onClick={copyRoomId}
                                    className="rounded-lg border border-white/[0.07] bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-bold text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
                                >
                                    Copy
                                </button>
                            </div>
                        )}

                        {myRole ? (
                            <div
                                className={`flex items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-bold ${getRoleStyle(
                                    myRole
                                )}`}
                            >
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_9px_#34d399]" />
                                <span>{getRoleIcon(myRole)}</span>
                                <span className="hidden sm:inline">
                                    {getRoleLabel(myRole)}
                                </span>
                            </div>
                        ) : (
                            <div className="hidden text-[10px] font-semibold text-slate-600 sm:block">
                                Not in a room
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <main className="relative mx-auto max-w-[1500px] px-4 pb-12 pt-6 sm:px-6 lg:px-8">

                {/* ENTRY STATE */}
                {!myRole && (
                    <section className="mx-auto max-w-5xl py-10 sm:py-16">

                        <div className="mb-10 text-center">
                            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-400/15 bg-indigo-400/[0.06] px-4 py-2 text-[9px] font-black tracking-[0.2em] text-indigo-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                                REAL-TIME WATCH PARTY
                            </div>

                            <h2 className="text-4xl font-black tracking-[-2px] sm:text-6xl">
                                Watch together.
                                <span className="block bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                                    From anywhere.
                                </span>
                            </h2>

                            <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-slate-500">
                                Create a synchronized YouTube room or join
                                your friends with a room ID.
                            </p>
                        </div>

                        {/* Identity */}
                        <div className="mb-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 backdrop-blur-xl sm:p-6">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-500/10 text-lg">
                                    👤
                                </div>

                                <div className="sm:w-48">
                                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-indigo-400">
                                        Your identity
                                    </p>

                                    <p className="mt-1 text-sm font-semibold">
                                        Choose a display name
                                    </p>
                                </div>

                                <input
                                    type="text"
                                    placeholder="e.g. Ramansh"
                                    value={username}
                                    onChange={(e) =>
                                        setUsername(e.target.value)
                                    }
                                    className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3 text-sm outline-none transition placeholder:text-slate-700 focus:border-indigo-400/40 focus:ring-4 focus:ring-indigo-500/10"
                                />
                            </div>
                        </div>

                        {/* Create / Join */}
                        <div className="grid gap-4 md:grid-cols-2">

                            {/* Create */}
                            <div className="relative overflow-hidden rounded-2xl border border-indigo-400/10 bg-gradient-to-br from-indigo-500/[0.07] to-transparent p-6">

                                <div className="absolute right-[-30px] top-[-30px] h-32 w-32 rounded-full bg-indigo-500/10 blur-3xl" />

                                <div className="relative">
                                    <div className="mb-6 flex items-center justify-between">
                                        <div>
                                            <p className="text-[9px] font-black tracking-[0.18em] text-indigo-400">
                                                HOST
                                            </p>

                                            <h3 className="mt-1 text-lg font-bold">
                                                Create a room
                                            </h3>
                                        </div>

                                        <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500/10 text-xl text-indigo-300">
                                            +
                                        </div>
                                    </div>

                                    <input
                                        type="text"
                                        placeholder="Room ID"
                                        value={roomId}
                                        onChange={(e) =>
                                            setRoomId(e.target.value)
                                        }
                                        className="mb-3 w-full rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-slate-700 focus:border-indigo-400/40 focus:ring-4 focus:ring-indigo-500/10"
                                    />

                                    <button
                                        onClick={createRoom}
                                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-3 text-sm font-bold shadow-lg shadow-indigo-500/20 transition hover:-translate-y-0.5 hover:shadow-indigo-500/30 active:translate-y-0"
                                    >
                                        Create Room
                                        <span>→</span>
                                    </button>
                                </div>
                            </div>

                            {/* Join */}
                            <div className="relative overflow-hidden rounded-2xl border border-violet-400/10 bg-gradient-to-br from-violet-500/[0.07] to-transparent p-6">

                                <div className="absolute right-[-30px] top-[-30px] h-32 w-32 rounded-full bg-violet-500/10 blur-3xl" />

                                <div className="relative">
                                    <div className="mb-6 flex items-center justify-between">
                                        <div>
                                            <p className="text-[9px] font-black tracking-[0.18em] text-violet-400">
                                                PARTICIPANT
                                            </p>

                                            <h3 className="mt-1 text-lg font-bold">
                                                Join a room
                                            </h3>
                                        </div>

                                        <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/10 text-xl text-violet-300">
                                            ↗
                                        </div>
                                    </div>

                                    <input
                                        type="text"
                                        placeholder="Enter Room ID"
                                        value={joinRoomId}
                                        onChange={(e) =>
                                            setJoinRoomId(e.target.value)
                                        }
                                        className="mb-3 w-full rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-slate-700 focus:border-violet-400/40 focus:ring-4 focus:ring-violet-500/10"
                                    />

                                    <button
                                        onClick={joinRoom}
                                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-5 py-3 text-sm font-bold transition hover:-translate-y-0.5 hover:border-violet-400/20 hover:bg-violet-500/10"
                                    >
                                        Join Room
                                        <span>→</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 flex flex-wrap justify-center gap-6 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-700">
                            <span>● Socket.IO</span>
                            <span>● YouTube IFrame API</span>
                            <span>● Real-time sync</span>
                        </div>
                    </section>
                )}

                {/* ACTIVE ROOM */}
                {myRole && (
                    <>
                        {/* ROOM COMMAND BAR */}
                        <section className="mb-4 flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">

                            <div className="flex items-center gap-3">
                                <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-sm">
                                    ●
                                </div>

                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-400">
                                        LIVE ROOM
                                    </p>

                                    <div className="mt-0.5 flex items-center gap-2">
                                        <span className="font-mono text-sm font-bold">
                                            {activeRoom}
                                        </span>

                                        <button
                                            onClick={copyRoomId}
                                            className="rounded-md border border-white/[0.07] px-2 py-1 text-[9px] font-bold text-slate-500 transition hover:bg-white/[0.06] hover:text-white"
                                        >
                                            Copy ID
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                    <span className="text-[10px] font-bold text-slate-500">
                                        {participants.length}{" "}
                                        {participants.length === 1
                                            ? "viewer"
                                            : "viewers"}
                                    </span>
                                </div>

                                <div
                                    className={`rounded-lg border px-3 py-2 text-[10px] font-bold ${getRoleStyle(
                                        myRole
                                    )}`}
                                >
                                    {getRoleIcon(myRole)}{" "}
                                    {getRoleLabel(myRole)}
                                </div>
                            </div>
                        </section>

                        {/* MAIN WORKSPACE */}
                        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">

                            {/* VIDEO AREA */}
                            <div className="min-w-0 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#090c14] shadow-2xl shadow-black/30">

                                {/* Video header */}
                                <div className="flex flex-col gap-3 border-b border-white/[0.06] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">

                                    <div className="flex items-center gap-3">
                                        <div className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-500/10 text-sm">
                                            🎬
                                        </div>

                                        <div>
                                            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-indigo-400">
                                                NOW PLAYING
                                            </p>

                                            <p className="mt-0.5 text-sm font-bold">
                                                Synchronized Player
                                            </p>
                                        </div>
                                    </div>

                                    {videoId ? (
                                        <div className="flex w-fit items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/[0.05] px-3 py-1.5 text-[9px] font-black tracking-widest text-emerald-400">
                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                                            SYNCED
                                        </div>
                                    ) : (
                                        <div className="w-fit rounded-full border border-white/[0.07] px-3 py-1.5 text-[9px] font-bold tracking-widest text-slate-600">
                                            NO VIDEO
                                        </div>
                                    )}
                                </div>

                                {/* Control strip */}
                                {myRole !== "participant" && (
                                    <div className="border-b border-white/[0.06] bg-black/20 p-3 sm:p-4">
                                        <div className="flex flex-col gap-2 sm:flex-row">

                                            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3">
                                                <span className="text-sm text-red-400">
                                                    ▶
                                                </span>

                                                <input
                                                    type="text"
                                                    placeholder="Paste YouTube video URL..."
                                                    value={videoUrl}
                                                    onChange={(e) =>
                                                        setVideoUrl(
                                                            e.target.value
                                                        )
                                                    }
                                                    className="min-w-0 flex-1 bg-transparent py-3 text-xs outline-none placeholder:text-slate-700"
                                                />
                                            </div>

                                            <button
                                                onClick={loadVideo}
                                                className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-3 text-xs font-black transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-500/20"
                                            >
                                                Load Video
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Participant notice */}
                                {myRole === "participant" && (
                                    <div className="border-b border-white/[0.06] bg-blue-500/[0.025] p-3">
                                        <div className="flex items-center gap-3 rounded-xl border border-blue-400/10 bg-blue-400/[0.03] px-3 py-2.5">
                                            <span className="text-sm">👁️</span>

                                            <div>
                                                <p className="text-[10px] font-bold text-blue-300">
                                                    Watch-only mode
                                                </p>

                                                <p className="text-[9px] text-slate-600">
                                                    Host or Moderator controls
                                                    playback.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Actual player */}
                                <div className="p-3 sm:p-5">
                                    {videoId ? (
                                        <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-black shadow-2xl shadow-black/40">
                                            <YouTubePlayer
                                                videoId={videoId}
                                                role={myRole}
                                                syncTime={syncTime}
                                                syncPlaying={syncPlaying}
                                            />
                                        </div>
                                    ) : (
                                        <div className="relative flex min-h-[400px] flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/[0.08] bg-black/30 px-5 text-center">

                                            <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/10 blur-[80px]" />

                                            <div className="relative mb-6 grid h-20 w-20 place-items-center rounded-3xl border border-indigo-400/15 bg-indigo-500/10 text-3xl shadow-2xl shadow-indigo-500/10">
                                                ▶
                                            </div>

                                            <h3 className="relative text-lg font-black">
                                                Your cinema is ready
                                            </h3>

                                            <p className="relative mt-2 max-w-md text-xs leading-6 text-slate-600">
                                                {myRole === "participant"
                                                    ? "Waiting for the Host or Moderator to start the watch party."
                                                    : "Paste a YouTube URL above and start watching together."}
                                            </p>

                                            {myRole !== "participant" && (
                                                <div className="relative mt-6 rounded-lg border border-white/[0.06] bg-white/[0.025] px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-700">
                                                    Synchronized playback enabled
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* PARTICIPANTS SIDEBAR */}
                            <aside className="flex min-h-[500px] flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-[#090c14]">

                                {/* Sidebar header */}
                                <div className="border-b border-white/[0.06] p-5">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-indigo-400">
                                                PEOPLE
                                            </p>

                                            <h3 className="mt-1 text-base font-black">
                                                Participants
                                            </h3>
                                        </div>

                                        <div className="grid h-9 min-w-9 place-items-center rounded-lg bg-indigo-500/10 px-2 text-xs font-black text-indigo-300">
                                            {participants.length}
                                        </div>
                                    </div>
                                </div>

                                {/* Participant list */}
                                <div className="flex-1 overflow-y-auto p-3">

                                    {participants.length === 0 ? (
                                        <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
                                            <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.03] text-xl">
                                                👥
                                            </div>

                                            <p className="text-xs font-bold text-slate-400">
                                                No one else here
                                            </p>

                                            <p className="mt-2 max-w-[190px] text-[10px] leading-5 text-slate-700">
                                                Share the room ID and invite
                                                friends.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-1.5">
                                            {participants.map(
                                                (participant) => (
                                                    <div
                                                        key={
                                                            participant.userId
                                                        }
                                                        className="group rounded-xl border border-transparent p-3 transition hover:border-white/[0.06] hover:bg-white/[0.025]"
                                                    >
                                                        <div className="flex items-center gap-3">

                                                            <div className="relative">
                                                                <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-black">
                                                                    {participant.username
                                                                        ?.charAt(
                                                                            0
                                                                        )
                                                                        .toUpperCase()}
                                                                </div>

                                                                <span className="absolute bottom-[-1px] right-[-1px] h-2.5 w-2.5 rounded-full border-2 border-[#090c14] bg-emerald-400" />
                                                            </div>

                                                            <div className="min-w-0 flex-1">
                                                                <p className="truncate text-xs font-bold text-slate-300">
                                                                    {
                                                                        participant.username
                                                                    }
                                                                </p>

                                                                <span
                                                                    className={`mt-1 inline-flex rounded-md border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide ${getRoleStyle(
                                                                        participant.role
                                                                    )}`}
                                                                >
                                                                    {participant.role ===
                                                                        "host" &&
                                                                        "👑 "}

                                                                    {participant.role ===
                                                                        "moderator" &&
                                                                        "🛡️ "}

                                                                    {getRoleLabel(
                                                                        participant.role
                                                                    )}
                                                                </span>
                                                            </div>

                                                            {myRole === "host" &&
                                                                participant.role !==
                                                                    "host" && (
                                                                    <div className="flex gap-1 opacity-40 transition group-hover:opacity-100">
                                                                        <button
                                                                            title="Make Moderator"
                                                                            onClick={() =>
                                                                                makeModerator(
                                                                                    participant.userId
                                                                                )
                                                                            }
                                                                            className="grid h-7 w-7 place-items-center rounded-md border border-white/[0.06] bg-white/[0.03] text-[11px] transition hover:bg-violet-500/15"
                                                                        >
                                                                            🛡️
                                                                        </button>

                                                                        <button
                                                                            title="Make Participant"
                                                                            onClick={() =>
                                                                                makeParticipant(
                                                                                    participant.userId
                                                                                )
                                                                            }
                                                                            className="grid h-7 w-7 place-items-center rounded-md border border-white/[0.06] bg-white/[0.03] text-[11px] transition hover:bg-white/10"
                                                                        >
                                                                            👤
                                                                        </button>

                                                                        <button
                                                                            title="Remove participant"
                                                                            onClick={() =>
                                                                                removeParticipant(
                                                                                    participant.userId
                                                                                )
                                                                            }
                                                                            className="grid h-7 w-7 place-items-center rounded-md border border-red-400/10 bg-red-500/[0.04] text-sm text-red-400 transition hover:bg-red-500/15"
                                                                        >
                                                                            ×
                                                                        </button>
                                                                    </div>
                                                                )}
                                                        </div>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Sidebar footer */}
                                <div className="border-t border-white/[0.06] p-4">
                                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                                        <div className="flex items-center gap-2">
                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_7px_#34d399]" />

                                            <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-600">
                                                Room is live
                                            </span>
                                        </div>

                                        <p className="mt-2 text-[10px] leading-5 text-slate-600">
                                            Playback stays synchronized for
                                            everyone in this room.
                                        </p>
                                    </div>
                                </div>
                            </aside>
                        </section>

                        {/* BOTTOM INFO */}
                        <section className="mt-4 grid gap-4 sm:grid-cols-3">

                            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                                <p className="text-[8px] font-black uppercase tracking-[0.18em] text-slate-700">
                                    CONNECTION
                                </p>

                                <div className="mt-2 flex items-center gap-2">
                                    <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                                    <span className="text-xs font-bold text-slate-400">
                                        Real-time connected
                                    </span>
                                </div>
                            </div>

                            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                                <p className="text-[8px] font-black uppercase tracking-[0.18em] text-slate-700">
                                    ROLE
                                </p>

                                <div className="mt-2 flex items-center gap-2">
                                    <span>
                                        {getRoleIcon(myRole)}
                                    </span>

                                    <span className="text-xs font-bold text-slate-400">
                                        {getRoleLabel(myRole)}
                                    </span>
                                </div>
                            </div>

                            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                                <p className="text-[8px] font-black uppercase tracking-[0.18em] text-slate-700">
                                    TECHNOLOGY
                                </p>

                                <div className="mt-2 text-xs font-bold text-slate-400">
                                    React + Socket.IO
                                </div>
                            </div>
                        </section>
                    </>
                )}

                {/* FOOTER */}
                <footer className="mt-8 flex flex-col gap-2 border-t border-white/[0.05] pt-6 text-[9px] text-slate-700 sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-black text-slate-600">
                        WATCHPARTY
                    </span>

                    <span>
                        Real-time synchronized YouTube experience
                    </span>

                    <span>
                        React • Node.js • Socket.IO
                    </span>
                </footer>
            </main>
        </div>
    );
}

export default App;