import { useEffect, useState, useRef } from "react";
import socket from "./socket";
import YouTubePlayer from "./components/YouTubePlayer";
import "./App.css";

function App() {
    // Room & Identity state
    const [roomId, setRoomId] = useState("");
    const [joinRoomId, setJoinRoomId] = useState("");
    const [activeRoom, setActiveRoom] = useState("");

    const [username, setUsername] = useState("");
    const [myRole, setMyRole] = useState("");
    const [isConnected, setIsConnected] = useState(socket.connected);

    // Room participants & video state
    const [participants, setParticipants] = useState([]);
    const [videoUrl, setVideoUrl] = useState("");
    const [videoId, setVideoId] = useState("");

    // Sync state
    const [syncTime, setSyncTime] = useState(null);
    const [syncPlaying, setSyncPlaying] = useState(false);

    // Sidebar Tab state ('participants' | 'chat')
    const [activeTab, setActiveTab] = useState("participants");

    // Chat state
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState("");
    const chatEndRef = useRef(null);

    // Reactions state (array of floating emoji objects)
    const [reactions, setReactions] = useState([]);

    // Toast notifications
    const [toasts, setToasts] = useState([]);

    // Modal state for confirmations
    const [modal, setModal] = useState(null); // { title, description, actionText, onConfirm }

    // Add toast helper
    const showToast = (message, type = "info") => {
        const id = Date.now() + Math.random();
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 4000);
    };

    // Auto-fill room ID from URL parameters (?room=XYZ)
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const urlRoom = params.get("room");
        if (urlRoom) {
            setJoinRoomId(urlRoom.toUpperCase());
            showToast(`Room code ${urlRoom.toUpperCase()} detected from share link!`, "info");
        }
    }, []);

    // Socket Event Listeners
    useEffect(() => {
        const handleConnect = () => {
            setIsConnected(true);
            console.log("Connected to server:", socket.id);
        };

        const handleDisconnect = () => {
            setIsConnected(false);
            console.log("Disconnected from server");
        };

        const handleRoomCreated = (createdRoomId) => {
            console.log("Room created:", createdRoomId);
            setActiveRoom(createdRoomId);
            setMyRole("host");
            setSyncTime(null);
            setSyncPlaying(false);
            showToast(`Room ${createdRoomId} created successfully! You are the Host.`, "success");
        };

        const handleRoomJoined = (joinedRoomId) => {
            console.log("Joined room:", joinedRoomId);
            setActiveRoom(joinedRoomId);
            showToast(`Joined room ${joinedRoomId}`, "success");
        };

        const handleSyncState = (state) => {
            console.log("Received sync state:", state);
            if (state.role) setMyRole(state.role);
            if (state.videoId) setVideoId(state.videoId);
            else setVideoId("");

            if (typeof state.currentTime === "number") setSyncTime(state.currentTime);
            if (typeof state.isPlaying === "boolean") setSyncPlaying(state.isPlaying);
        };

        const handleVideoLoaded = (newVideoId) => {
            console.log("Video received from room:", newVideoId);
            setVideoId(newVideoId);
            setSyncTime(0);
            setSyncPlaying(false);
            showToast("New video loaded into watch party", "info");
        };

        const handleParticipantsUpdated = (updatedParticipants) => {
            console.log("Participants updated:", updatedParticipants);
            setParticipants(updatedParticipants);
        };

        const handleRoleUpdated = (role) => {
            console.log("My role updated:", role);
            setMyRole(role);
            const roleName = role === "host" ? "Host 👑" : role === "moderator" ? "Moderator 🛡️" : "Participant 👤";
            showToast(`Your role has been updated to ${roleName}`, "info");
        };

        const handlePermissionDenied = (message) => {
            showToast(message, "error");
        };

        const handleParticipantRemoved = () => {
            showToast("You have been removed from the room by the Host.", "warning");
            setActiveRoom("");
            setMyRole("");
            setVideoId("");
            setSyncTime(null);
            setSyncPlaying(false);
            setParticipants([]);
            setChatMessages([]);
        };

        const handleRoomError = (message) => {
            showToast(message, "error");
        };

        const handleHostTransferred = ({ newHostName }) => {
            showToast(`👑 ${newHostName} is now the Host!`, "info");
        };

        const handleChatMessage = (msg) => {
            setChatMessages((prev) => [...prev, msg]);
        };

        const handleReactionReceived = (reaction) => {
            const rxId = Date.now() + Math.random();
            const leftPos = Math.floor(Math.random() * 70) + 15; // Random horizontal placement
            setReactions((prev) => [...prev, { ...reaction, rxId, leftPos }]);

            setTimeout(() => {
                setReactions((prev) => prev.filter((r) => r.rxId !== rxId));
            }, 3000);
        };

        socket.on("connect", handleConnect);
        socket.on("disconnect", handleDisconnect);
        socket.on("room_created", handleRoomCreated);
        socket.on("room_joined", handleRoomJoined);
        socket.on("sync_state", handleSyncState);
        socket.on("video_loaded", handleVideoLoaded);
        socket.on("participants_updated", handleParticipantsUpdated);
        socket.on("role_updated", handleRoleUpdated);
        socket.on("permission_denied", handlePermissionDenied);
        socket.on("participant_removed", handleParticipantRemoved);
        socket.on("room_error", handleRoomError);
        socket.on("host_transferred", handleHostTransferred);
        socket.on("chat_message", handleChatMessage);
        socket.on("reaction_received", handleReactionReceived);

        return () => {
            socket.off("connect", handleConnect);
            socket.off("disconnect", handleDisconnect);
            socket.off("room_created", handleRoomCreated);
            socket.off("room_joined", handleRoomJoined);
            socket.off("sync_state", handleSyncState);
            socket.off("video_loaded", handleVideoLoaded);
            socket.off("participants_updated", handleParticipantsUpdated);
            socket.off("role_updated", handleRoleUpdated);
            socket.off("permission_denied", handlePermissionDenied);
            socket.off("participant_removed", handleParticipantRemoved);
            socket.off("room_error", handleRoomError);
            socket.off("host_transferred", handleHostTransferred);
            socket.off("chat_message", handleChatMessage);
            socket.off("reaction_received", handleReactionReceived);
        };
    }, []);

    // Auto-scroll chat to bottom
    useEffect(() => {
        if (activeTab === "chat" && chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [chatMessages, activeTab]);

    // Generate random room code
    const generateRandomRoomId = () => {
        const code = "PARTY-" + Math.random().toString(36).substring(2, 7).toUpperCase();
        setRoomId(code);
    };

    // Actions
    const createRoom = () => {
        if (!username.trim()) {
            showToast("Please enter your display name first", "warning");
            return;
        }

        const targetRoomId = roomId.trim() || "PARTY-" + Math.random().toString(36).substring(2, 7).toUpperCase();

        socket.emit("create_room", {
            roomId: targetRoomId,
            username: username.trim()
        });
    };

    const joinRoom = () => {
        if (!username.trim()) {
            showToast("Please enter your display name first", "warning");
            return;
        }

        if (!joinRoomId.trim()) {
            showToast("Please enter a Room Code to join", "warning");
            return;
        }

        socket.emit("join_room", {
            roomId: joinRoomId.trim(),
            username: username.trim()
        });
    };

    // Extract YouTube ID safely from any valid URL
    const parseYouTubeId = (urlStr) => {
        if (!urlStr) return null;
        try {
            // Handle standard youtube URLs, share URLs (youtu.be), or raw 11-char IDs
            if (urlStr.length === 11 && !urlStr.includes("/")) {
                return urlStr;
            }
            const parsedUrl = new URL(urlStr);
            if (parsedUrl.hostname === "youtu.be") {
                return parsedUrl.pathname.slice(1);
            }
            if (parsedUrl.hostname.includes("youtube.com")) {
                if (parsedUrl.pathname.includes("/embed/")) {
                    return parsedUrl.pathname.split("/embed/")[1];
                }
                return parsedUrl.searchParams.get("v");
            }
        } catch (err) {
            return null;
        }
        return null;
    };

    const loadVideo = () => {
        if (myRole === "participant") {
            showToast("Participants cannot change the video.", "warning");
            return;
        }

        if (!videoUrl.trim()) {
            showToast("Enter a valid YouTube URL", "warning");
            return;
        }

        const extractedId = parseYouTubeId(videoUrl.trim());
        if (!extractedId) {
            showToast("Invalid YouTube URL or Video ID format", "error");
            return;
        }

        setVideoId(extractedId);
        setSyncTime(0);
        setSyncPlaying(false);

        socket.emit("load_video", extractedId);
    };

    // Role assignment handlers
    const makeModerator = (userId) => {
        socket.emit("assign_role", { userId, role: "moderator" });
    };

    const makeParticipant = (userId) => {
        socket.emit("assign_role", { userId, role: "participant" });
    };

    const confirmTransferHost = (user) => {
        setModal({
            title: "Transfer Host Role?",
            description: `Are you sure you want to transfer Host ownership to ${user.username}? You will become a Moderator.`,
            actionText: "Transfer Host",
            confirmStyle: "bg-amber-500 hover:bg-amber-600 text-black",
            onConfirm: () => {
                socket.emit("transfer_host", user.userId);
                setModal(null);
            }
        });
    };

    const confirmRemoveParticipant = (user) => {
        setModal({
            title: "Remove Participant?",
            description: `Are you sure you want to kick ${user.username} from this watch party room?`,
            actionText: "Remove User",
            confirmStyle: "bg-red-600 hover:bg-red-700 text-white",
            onConfirm: () => {
                socket.emit("remove_participant", user.userId);
                setModal(null);
            }
        });
    };

    // Share link copy
    const copyShareLink = async () => {
        if (!activeRoom) return;

        const shareUrl = `${window.location.origin}${window.location.pathname}?room=${activeRoom}`;
        try {
            await navigator.clipboard.writeText(shareUrl);
            showToast("Shareable link copied to clipboard! 📋", "success");
        } catch (err) {
            showToast(`Room Code: ${activeRoom}`, "info");
        }
    };

    // Chat message send
    const sendChatMessage = (e) => {
        e.preventDefault();
        if (!chatInput.trim()) return;
        socket.emit("send_chat_message", chatInput);
        setChatInput("");
    };

    // Send Emoji Reaction
    const sendEmojiReaction = (emoji) => {
        socket.emit("send_reaction", emoji);
        // Show locally immediately as well
        const rxId = Date.now() + Math.random();
        const leftPos = Math.floor(Math.random() * 70) + 15;
        setReactions((prev) => [...prev, { emoji, username: "You", rxId, leftPos }]);
        setTimeout(() => {
            setReactions((prev) => prev.filter((r) => r.rxId !== rxId));
        }, 3000);
    };

    const leaveRoom = () => {
        window.location.href = window.location.pathname;
    };

    const getRoleLabel = (role) => {
        if (role === "host") return "Host";
        if (role === "moderator") return "Moderator";
        return "Participant";
    };

    const getRoleBadgeStyle = (role) => {
        if (role === "host") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
        if (role === "moderator") return "border-purple-500/30 bg-purple-500/10 text-purple-300";
        return "border-slate-500/30 bg-slate-500/10 text-slate-300";
    };

    const getRoleIcon = (role) => {
        if (role === "host") return "👑";
        if (role === "moderator") return "🛡️";
        return "👤";
    };

    return (
        <div className="min-h-screen bg-[#070913] text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
            {/* Background Glow Orbs */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full bg-indigo-600/10 blur-[150px]" />
                <div className="absolute top-[30%] right-[-10%] w-[550px] h-[550px] rounded-full bg-purple-600/10 blur-[150px]" />
            </div>

            {/* TOAST NOTIFICATIONS */}
            <div className="fixed top-5 right-5 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={`pointer-events-auto flex items-center gap-3 p-4 rounded-xl border backdrop-blur-xl shadow-2xl transition-all duration-300 transform translate-y-0 ${
                            toast.type === "error"
                                ? "bg-red-950/80 border-red-500/30 text-red-200"
                                : toast.type === "warning"
                                ? "bg-amber-950/80 border-amber-500/30 text-amber-200"
                                : toast.type === "success"
                                ? "bg-emerald-950/80 border-emerald-500/30 text-emerald-200"
                                : "bg-indigo-950/80 border-indigo-500/30 text-indigo-200"
                        }`}
                    >
                        <span className="text-lg">
                            {toast.type === "error"
                                ? "⚠️"
                                : toast.type === "warning"
                                ? "🔔"
                                : toast.type === "success"
                                ? "✅"
                                : "ℹ️"}
                        </span>
                        <p className="text-xs font-semibold leading-relaxed">{toast.message}</p>
                    </div>
                ))}
            </div>

            {/* CONFIRMATION MODAL */}
            {modal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-[#0d1120] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
                        <h3 className="text-lg font-bold text-white">{modal.title}</h3>
                        <p className="text-xs text-slate-400 leading-relaxed">{modal.description}</p>
                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                onClick={() => setModal(null)}
                                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={modal.onConfirm}
                                className={`px-4 py-2 text-xs font-bold rounded-xl transition ${modal.confirmStyle}`}
                            >
                                {modal.actionText}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TOP NAVIGATION BAR */}
            <header className="sticky top-0 z-50 border-b border-white/10 bg-[#070913]/90 backdrop-blur-2xl">
                <div className="max-w-[1600px] mx-auto h-18 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                            <span className="text-white text-base font-black">▶</span>
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-extrabold text-base tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-200 bg-clip-text text-transparent">
                                    WatchParty
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black tracking-widest uppercase bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                                    LIVE
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 sm:gap-5">
                        {activeRoom && (
                            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5">
                                <div className="text-left">
                                    <p className="text-[8px] font-black uppercase tracking-wider text-slate-500">ROOM</p>
                                    <p className="font-mono text-xs font-bold text-indigo-300">{activeRoom}</p>
                                </div>
                                <button
                                    onClick={copyShareLink}
                                    title="Copy Share Link"
                                    className="ml-2 px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-[10px] font-bold text-indigo-300 transition"
                                >
                                    🔗 Share Link
                                </button>
                            </div>
                        )}

                        {myRole ? (
                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold ${getRoleBadgeStyle(myRole)}`}>
                                <span>{getRoleIcon(myRole)}</span>
                                <span className="hidden sm:inline">{getRoleLabel(myRole)}</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-slate-400">
                                <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-red-500"}`} />
                                <span>{isConnected ? "Connected" : "Disconnected"}</span>
                            </div>
                        )}

                        {activeRoom && (
                            <button
                                onClick={leaveRoom}
                                className="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs font-bold transition"
                            >
                                Leave
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {/* MAIN CONTENT AREA */}
            <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {!activeRoom ? (
                    /* ENTRY HERO & ROOM CREATION SECTION */
                    <div className="max-w-4xl mx-auto py-12 space-y-10">
                        <div className="text-center space-y-4">
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 text-indigo-300 text-xs font-bold tracking-widest uppercase">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                                Real-time YouTube Cinema
                            </div>
                            <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white">
                                Sync YouTube videos with <br />
                                <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                                    friends anywhere.
                                </span>
                            </h1>
                            <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
                                Experience zero-latency playback synchronization, live room chat, host moderation controls, and real-time emoji reactions.
                            </p>
                        </div>

                        {/* DISPLAY NAME INPUT */}
                        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 backdrop-blur-xl space-y-3">
                            <label className="block text-xs font-bold uppercase tracking-wider text-indigo-400">
                                1. Enter Your Display Name
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. Ramansh Agarwal"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 outline-none transition"
                            />
                        </div>

                        {/* CREATE OR JOIN ROOM GRID */}
                        <div className="grid md:grid-cols-2 gap-6">
                            {/* CREATE ROOM CARD */}
                            <div className="relative overflow-hidden bg-gradient-to-b from-indigo-900/20 to-indigo-950/40 border border-indigo-500/20 rounded-2xl p-6 space-y-4 backdrop-blur-xl">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <span className="text-[10px] font-black tracking-widest uppercase text-indigo-400">HOST MODE</span>
                                        <h3 className="text-xl font-bold text-white mt-1">Create a Room</h3>
                                    </div>
                                    <span className="text-3xl">👑</span>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="Room Code (Optional)"
                                            value={roomId}
                                            onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                                            className="flex-1 bg-black/40 border border-white/10 focus:border-indigo-500 rounded-xl px-4 py-3 text-sm font-mono text-white placeholder-slate-600 outline-none transition"
                                        />
                                        <button
                                            onClick={generateRandomRoomId}
                                            type="button"
                                            className="px-3 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-300 transition"
                                            title="Generate Code"
                                        >
                                            🎲 Auto
                                        </button>
                                    </div>

                                    <button
                                        onClick={createRoom}
                                        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm shadow-xl shadow-indigo-600/25 transition active:scale-[0.99]"
                                    >
                                        Create Watch Party →
                                    </button>
                                </div>
                            </div>

                            {/* JOIN ROOM CARD */}
                            <div className="relative overflow-hidden bg-gradient-to-b from-purple-900/20 to-purple-950/40 border border-purple-500/20 rounded-2xl p-6 space-y-4 backdrop-blur-xl">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <span className="text-[10px] font-black tracking-widest uppercase text-purple-400">PARTICIPANT MODE</span>
                                        <h3 className="text-xl font-bold text-white mt-1">Join a Room</h3>
                                    </div>
                                    <span className="text-3xl">🚀</span>
                                </div>

                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        placeholder="Enter Room Code (e.g. PARTY-XYZ)"
                                        value={joinRoomId}
                                        onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                                        className="w-full bg-black/40 border border-white/10 focus:border-purple-500 rounded-xl px-4 py-3 text-sm font-mono text-white placeholder-slate-600 outline-none transition"
                                    />

                                    <button
                                        onClick={joinRoom}
                                        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-sm shadow-xl shadow-purple-600/25 transition active:scale-[0.99]"
                                    >
                                        Join Watch Party →
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* ACTIVE WATCH PARTY WORKSPACE */
                    <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
                        {/* LEFT COLUMN: CINEMA PLAYER & CONTROLS */}
                        <div className="space-y-4 min-w-0">
                            {/* VIDEO PLAYER FRAME CONTAINER */}
                            <div className="relative rounded-2xl border border-white/10 bg-[#0c0f1d] overflow-hidden shadow-2xl shadow-black/80">
                                {/* VIDEO HEADER BAR */}
                                <div className="p-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 bg-white/[0.02]">
                                    <div className="flex items-center gap-3">
                                        <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                                        <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                                            Synchronized Player
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {videoId ? (
                                            <span className="px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                                ● LIVE SYNCED
                                            </span>
                                        ) : (
                                            <span className="px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase bg-slate-500/10 border border-slate-500/20 text-slate-400">
                                                NO VIDEO LOADED
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* HOST / MODERATOR VIDEO URL INPUT STRIP */}
                                {myRole !== "participant" && (
                                    <div className="p-4 border-b border-white/10 bg-black/40">
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="Paste YouTube Video URL or Video ID..."
                                                value={videoUrl}
                                                onChange={(e) => setVideoUrl(e.target.value)}
                                                onKeyDown={(e) => e.key === "Enter" && loadVideo()}
                                                className="flex-1 bg-white/5 border border-white/10 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition"
                                            />
                                            <button
                                                onClick={loadVideo}
                                                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition shrink-0"
                                            >
                                                Load Video
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* PARTICIPANT NOTICE STRIP */}
                                {myRole === "participant" && (
                                    <div className="px-4 py-2.5 border-b border-white/10 bg-indigo-950/30 flex items-center justify-between text-xs text-indigo-200">
                                        <div className="flex items-center gap-2">
                                            <span>👁️</span>
                                            <span>Watch-only mode. Host & Moderators control playback.</span>
                                        </div>
                                    </div>
                                )}

                                {/* ACTUAL YOUTUBE IFRAME CANVAS */}
                                <div className="relative aspect-video w-full bg-black">
                                    {videoId ? (
                                        <YouTubePlayer
                                            videoId={videoId}
                                            role={myRole}
                                            syncTime={syncTime}
                                            syncPlaying={syncPlaying}
                                        />
                                    ) : (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-4">
                                            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-3xl text-indigo-400">
                                                🎬
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold text-white">No Video Loaded</h3>
                                                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                                                    {myRole === "participant"
                                                        ? "Waiting for the Host or Moderator to select a YouTube video."
                                                        : "Paste a YouTube link above to start watching together."}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* FLOATING EMOJI REACTIONS OVERLAY */}
                                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                                        {reactions.map((rx) => (
                                            <div
                                                key={rx.rxId}
                                                style={{ left: `${rx.leftPos}%`, bottom: "10%" }}
                                                className="absolute animate-float-reaction flex flex-col items-center"
                                            >
                                                <span className="text-4xl drop-shadow-lg">{rx.emoji}</span>
                                                <span className="text-[9px] font-bold bg-black/60 text-white px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                                                    {rx.username}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* BOTTOM EMOJI REACTION BAR */}
                                <div className="p-3 border-t border-white/10 bg-black/40 flex items-center justify-between">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reactions</span>
                                    <div className="flex items-center gap-1.5">
                                        {["❤️", "🔥", "🎉", "😂", "👏", "👍"].map((emoji) => (
                                            <button
                                                key={emoji}
                                                onClick={() => sendEmojiReaction(emoji)}
                                                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-base transition active:scale-90"
                                            >
                                                {emoji}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: SIDEBAR (PARTICIPANTS & LIVE CHAT) */}
                        <div className="bg-[#0c0f1d] border border-white/10 rounded-2xl overflow-hidden flex flex-col h-[600px] lg:h-[680px] shadow-2xl">
                            {/* SIDEBAR TAB HEADER */}
                            <div className="flex border-b border-white/10 bg-white/[0.02]">
                                <button
                                    onClick={() => setActiveTab("participants")}
                                    className={`flex-1 py-3.5 text-xs font-bold transition flex items-center justify-center gap-2 border-b-2 ${
                                        activeTab === "participants"
                                            ? "border-indigo-500 text-indigo-300 bg-indigo-500/10"
                                            : "border-transparent text-slate-400 hover:text-white"
                                    }`}
                                >
                                    <span>👥 People</span>
                                    <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/10 text-slate-300">
                                        {participants.length}
                                    </span>
                                </button>
                                <button
                                    onClick={() => setActiveTab("chat")}
                                    className={`flex-1 py-3.5 text-xs font-bold transition flex items-center justify-center gap-2 border-b-2 ${
                                        activeTab === "chat"
                                            ? "border-indigo-500 text-indigo-300 bg-indigo-500/10"
                                            : "border-transparent text-slate-400 hover:text-white"
                                    }`}
                                >
                                    <span>💬 Live Chat</span>
                                    {chatMessages.length > 0 && (
                                        <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-indigo-500/20 text-indigo-300 font-mono">
                                            {chatMessages.length}
                                        </span>
                                    )}
                                </button>
                            </div>

                            {/* TAB 1: PARTICIPANTS LIST */}
                            {activeTab === "participants" && (
                                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-2">
                                    {participants.map((user) => (
                                        <div
                                            key={user.userId}
                                            className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between gap-3 group hover:border-white/10 transition"
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="relative">
                                                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center font-bold text-xs text-white">
                                                        {user.username?.charAt(0).toUpperCase()}
                                                    </div>
                                                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#0c0f1d]" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-white truncate">
                                                        {user.username} {user.userId === socket.id && <span className="text-[10px] text-indigo-400 font-normal">(You)</span>}
                                                    </p>
                                                    <span className={`inline-block mt-0.5 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${getRoleBadgeStyle(user.role)}`}>
                                                        {getRoleIcon(user.role)} {getRoleLabel(user.role)}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* HOST MANAGEMENT ACTIONS */}
                                            {myRole === "host" && user.userId !== socket.id && (
                                                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                                                    {user.role !== "moderator" && (
                                                        <button
                                                            onClick={() => makeModerator(user.userId)}
                                                            title="Promote to Moderator"
                                                            className="w-7 h-7 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-purple-300 text-xs flex items-center justify-center transition"
                                                        >
                                                            🛡️
                                                        </button>
                                                    )}
                                                    {user.role !== "participant" && (
                                                        <button
                                                            onClick={() => makeParticipant(user.userId)}
                                                            title="Set to Participant"
                                                            className="w-7 h-7 rounded-lg bg-slate-500/10 hover:bg-slate-500/20 border border-slate-500/20 text-slate-300 text-xs flex items-center justify-center transition"
                                                        >
                                                            👤
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => confirmTransferHost(user)}
                                                        title="Transfer Host Role"
                                                        className="w-7 h-7 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-300 text-xs flex items-center justify-center transition"
                                                    >
                                                        👑
                                                    </button>
                                                    <button
                                                        onClick={() => confirmRemoveParticipant(user)}
                                                        title="Remove User"
                                                        className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs flex items-center justify-center transition"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* TAB 2: LIVE ROOM CHAT */}
                            {activeTab === "chat" && (
                                <div className="flex-1 flex flex-col min-h-0">
                                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
                                        {chatMessages.length === 0 ? (
                                            <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-4">
                                                <span className="text-3xl mb-2">💬</span>
                                                <p className="text-xs font-semibold">No messages yet</p>
                                                <p className="text-[10px]">Be the first to say hi!</p>
                                            </div>
                                        ) : (
                                            chatMessages.map((msg) => (
                                                <div
                                                    key={msg.id}
                                                    className={`space-y-1 ${msg.userId === socket.id ? "text-right" : "text-left"}`}
                                                >
                                                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                                        <span className="font-bold text-slate-200">{msg.username}</span>
                                                        <span>{getRoleIcon(msg.role)}</span>
                                                        <span className="text-slate-600">
                                                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                        </span>
                                                    </div>
                                                    <div
                                                        className={`inline-block max-w-[85%] px-3.5 py-2 rounded-2xl text-xs leading-relaxed text-left ${
                                                            msg.userId === socket.id
                                                                ? "bg-indigo-600 text-white rounded-tr-none"
                                                                : "bg-white/10 text-slate-200 rounded-tl-none border border-white/5"
                                                        }`}
                                                    >
                                                        {msg.message}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                        <div ref={chatEndRef} />
                                    </div>

                                    {/* CHAT INPUT FORM */}
                                    <form onSubmit={sendChatMessage} className="p-3 border-t border-white/10 bg-black/40 flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="Type a message..."
                                            value={chatInput}
                                            onChange={(e) => setChatInput(e.target.value)}
                                            className="flex-1 bg-white/5 border border-white/10 focus:border-indigo-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none transition"
                                        />
                                        <button
                                            type="submit"
                                            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition"
                                        >
                                            Send
                                        </button>
                                    </form>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

export default App;