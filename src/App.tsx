/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  ChevronLeft, 
  LogOut, 
  Star, 
  Play, 
  Folder, 
  Video, 
  Download, 
  Lock, 
  Smartphone, 
  Key, 
  CheckCircle2, 
  Copy,
  LayoutDashboard,
  BookOpen,
  Clock
} from 'lucide-react';
import Hls from 'hls.js';
import { 
  Academy, 
  Course, 
  Video as VideoType, 
  AuthData 
} from './types';
import { 
  getProxyUrl, 
  decrypt, 
  decode_base64, 
  API_MAP, 
  fetchWithHeaders, 
  fetchMultiAll 
} from './services/api';

const ACADEMY_JSON = "https://raw.githubusercontent.com/Aublic-sudo/okP/master/appxapis.json";

export default function App() {
  // --- State ---
  const [screen, setScreen] = useState<'academy' | 'login' | 'otp' | 'dashboard' | 'course'>('academy');
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [filteredAcademies, setFilteredAcademies] = useState<Academy[]>([]);
  const [selectedAcademy, setSelectedAcademy] = useState<Academy | null>(null);
  const [auth, setAuth] = useState<AuthData | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [purchasedCourses, setPurchasedCourses] = useState<Course[]>([]);
  const [favorites, setFavorites] = useState<Course[]>([]);
  const [currentCourse, setCurrentCourse] = useState<Course | null>(null);
  const [activeTab, setActiveTab] = useState<'live' | 'recorded' | 'folder'>('live');
  const [videos, setVideos] = useState<VideoType[]>([]);
  const [courseStart, setCourseStart] = useState(0);
  const [recStart, setRecStart] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showTokenPopup, setShowTokenPopup] = useState<string | null>(null);
  const [playerUrl, setPlayerUrl] = useState<string | null>(null);
  const [isHls, setIsHls] = useState(false);

  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // --- Effects ---
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUserId = localStorage.getItem('userid');
    const savedApiBase = localStorage.getItem('api_base');
    const savedFavs = localStorage.getItem('favCourses');

    if (savedFavs) setFavorites(JSON.parse(savedFavs));

    if (savedToken && savedUserId && savedApiBase) {
      setAuth({ token: savedToken, userId: savedUserId, apiBase: savedApiBase });
      setScreen('dashboard');
    } else {
      fetchAcademies();
    }
  }, []);

  useEffect(() => {
    if (auth && screen === 'dashboard') {
      loadCourses();
      loadPurchased();
    }
  }, [auth, screen]);

  useEffect(() => {
    if (currentCourse) {
      if (activeTab === 'live') loadLive();
      else if (activeTab === 'recorded') loadRecorded(true);
      else if (activeTab === 'folder') loadFolder();
    }
  }, [currentCourse, activeTab]);

  useEffect(() => {
    if (isHls && playerUrl && videoRef.current) {
      if (hlsRef.current) hlsRef.current.destroy();
      
      const hls = new Hls({ lowLatencyMode: true });
      hls.loadSource(getProxyUrl(playerUrl));
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoRef.current?.play().catch(e => console.log("Autoplay blocked", e));
      });
      hlsRef.current = hls;

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }
  }, [isHls, playerUrl]);

  // --- Functions ---
  const fetchAcademies = async () => {
    try {
      const res = await fetch(ACADEMY_JSON);
      const data = await res.json();
      setAcademies(data);
      setFilteredAcademies(data);
    } catch (e) {
      console.error("Failed to load academies", e);
    }
  };

  const loadCourses = async (reset = false) => {
    if (!auth) return;
    setLoading(true);
    const start = reset ? 0 : courseStart;
    const urls = API_MAP.courses.map(e => auth.apiBase + e.replace("{start}", start.toString()));
    const j = await fetchMultiAll(urls, { token: auth.token, userId: auth.userId });
    
    if (j.data?.length) {
      setCourses(prev => reset ? j.data : [...prev, ...j.data]);
      setCourseStart(start + j.data.length);
    }
    setLoading(false);
  };

  const loadPurchased = async () => {
    if (!auth) return;
    const urls = API_MAP.purchased.map(e => auth.apiBase + e.replace("{uid}", auth.userId));
    const j = await fetchMultiAll(urls, { token: auth.token, userId: auth.userId });
    if (j.data) setPurchasedCourses(j.data);
  };

  const loadLive = async () => {
    if (!auth || !currentCourse) return;
    setLoading(true);
    const urls = API_MAP.live.map(e => auth.apiBase + e.replace("{id}", currentCourse.id.toString()));
    const j = await fetchMultiAll(urls, { token: auth.token, userId: auth.userId });
    
    let liveList: VideoType[] = [];
    if (Array.isArray(j.data)) {
      j.data.forEach((obj: any) => {
        if (obj.live && Array.isArray(obj.live)) liveList = [...liveList, ...obj.live];
        if (obj.material_type || obj.Title) liveList.push(obj);
      });
    }
    setVideos(liveList);
    setLoading(false);
  };

  const loadRecorded = async (reset = false) => {
    if (!auth || !currentCourse) return;
    setLoading(true);
    const start = reset ? 0 : recStart;
    const urls = API_MAP.recorded.map(e => 
      auth.apiBase + e.replace("{id}", currentCourse.id.toString()).replace("{start}", start.toString()).replace("{uid}", auth.userId)
    );
    const j = await fetchMultiAll(urls, { token: auth.token, userId: auth.userId });
    
    if (j.data) {
      const sorted = j.data.sort((a: any, b: any) => (b.strtotime || 0) - (a.strtotime || 0));
      setVideos(prev => reset ? sorted : [...prev, ...sorted]);
      setRecStart(start + j.data.length);
    }
    setLoading(false);
  };

  const loadFolder = async () => {
    if (!auth || !currentCourse) return;
    setLoading(true);
    const url = auth.apiBase + API_MAP.folder_subject[0].replace("{id}", currentCourse.id.toString());
    const j = await fetchWithHeaders(url, { token: auth.token, userId: auth.userId });
    if (j?.data) setVideos(j.data);
    setLoading(false);
  };

  const playVideo = async (video: VideoType) => {
    if (!auth || !currentCourse) return;
    setLoading(true);
    setPlayerUrl(null);
    setIsHls(false);

    const urls = API_MAP.player.map(e => 
      auth.apiBase + e.replace("{id}", currentCourse.id.toString()).replace("{vid}", video.id.toString())
    );
    const j = await fetchMultiAll(urls, { token: auth.token, userId: auth.userId });
    
    if (!j.data || j.data.length === 0) {
      alert("Video data not found");
      setLoading(false);
      return;
    }

    const data = Array.isArray(j.data) ? j.data[0] : j.data;

    if (data.video_player_url && data.video_player_token) {
      setPlayerUrl(data.video_player_url + data.video_player_token);
      setIsHls(false);
    } else if (data.download_link || data.download_links?.length) {
      const encrypted = data.download_links?.[0]?.path || data.download_link;
      const realLink = decrypt(encrypted).trim().replace(/\s/g, "");
      setPlayerUrl(realLink);
      setIsHls(true);
    } else if (data.encrypted_links?.length) {
      const linkObj = data.encrypted_links[0];
      const a = linkObj.path;
      const k = linkObj.key;
      if (a && k) {
        const k1 = decrypt(k);
        const k2 = decode_base64(k1);
        const da = decrypt(a);
        setPlayerUrl(`https://appx-play.classx.co.in/combined-img-player?isMobile=true&videoPlayer=hls&urls=${encodeURIComponent(da)}&key=${encodeURIComponent(k2)}`);
      } else if (a) {
        const da = decrypt(a);
        setPlayerUrl(`https://appx-play.classx.co.in/combined-img-player?isMobile=true&videoPlayer=hls&urls=${encodeURIComponent(da)}`);
      }
      setIsHls(false);
    } else {
      alert("Video locked or unsupported");
    }
    setLoading(false);
  };

  const toggleFavorite = (course: Course) => {
    const isFav = favorites.some(f => f.id === course.id);
    let newFavs;
    if (isFav) {
      newFavs = favorites.filter(f => f.id !== course.id);
    } else {
      newFavs = [...favorites, course];
    }
    setFavorites(newFavs);
    localStorage.setItem('favCourses', JSON.stringify(newFavs));
  };

  const logout = () => {
    localStorage.clear();
    setAuth(null);
    setScreen('academy');
    setCourses([]);
    setPurchasedCourses([]);
    setFavorites([]);
  };

  // --- Render Helpers ---
  const renderCourseCard = (course: Course) => {
    const isFav = favorites.some(f => f.id === course.id);
    const thumb = course.course_thumbnail || "https://via.placeholder.com/600x300?text=No+Image";

    return (
      <motion.div 
        key={course.id}
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="group relative bg-zinc-900/50 border border-white/5 rounded-2xl overflow-hidden hover:border-sky-500/50 transition-all duration-300"
      >
        <div className="aspect-video relative overflow-hidden cursor-pointer" onClick={() => { setCurrentCourse(course); setScreen('course'); }}>
          <img 
            src={thumb} 
            alt={course.course_name}
            onError={(e) => {
              (e.target as HTMLImageElement).src = "https://via.placeholder.com/600x300?text=No+Image";
            }}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-sky-500 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <Play className="w-6 h-6 text-white fill-current" />
            </div>
          </div>
        </div>
        
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-zinc-100 line-clamp-2 flex-1">{course.course_name || course.title}</h3>
            <button 
              onClick={() => toggleFavorite(course)}
              className={`p-2 rounded-lg transition-colors ${isFav ? 'text-amber-400 bg-amber-400/10' : 'text-zinc-500 hover:text-zinc-300 bg-white/5'}`}
            >
              <Star className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold text-zinc-500">
            <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">ID: {course.id}</span>
          </div>
        </div>
      </motion.div>
    );
  };

  // --- Main Render ---
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 font-sans selection:bg-sky-500/30">
      
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/50 backdrop-blur-xl border-b border-white/5 px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {screen !== 'academy' && screen !== 'dashboard' && (
            <button 
              onClick={() => {
                if (screen === 'course') setScreen('dashboard');
                else if (screen === 'login' || screen === 'otp') setScreen('academy');
              }}
              className="p-2 hover:bg-white/5 rounded-full transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          <h1 className="text-lg font-bold tracking-tight">
            {screen === 'course' ? currentCourse?.course_name : 'Dashboard'}
          </h1>
        </div>
        
        {auth && (
          <button 
            onClick={logout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 text-red-500 text-sm font-semibold hover:bg-red-500/20 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        )}
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-6">
        <AnimatePresence mode="wait">
          
          {/* Academy Selection */}
          {screen === 'academy' && (
            <motion.div 
              key="academy"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto"
            >
              <div className="text-center mb-12">
                <h2 className="text-4xl font-black mb-4 tracking-tighter uppercase">Select Academy</h2>
                <p className="text-zinc-500">Choose your learning platform to continue</p>
              </div>

              <div className="relative mb-8">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input 
                  type="text"
                  placeholder="Search for an academy..."
                  className="w-full bg-zinc-900 border border-white/10 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:border-sky-500 transition-colors"
                  onChange={(e) => {
                    const v = e.target.value.toLowerCase();
                    setFilteredAcademies(academies.filter(a => a.name.toLowerCase().includes(v)));
                  }}
                />
              </div>

              <div className="grid gap-2 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {filteredAcademies.map((a, i) => (
                  <button 
                    key={i}
                    onClick={() => { setSelectedAcademy(a); setScreen('login'); }}
                    className="w-full text-left p-4 rounded-xl bg-zinc-900/50 border border-white/5 hover:border-sky-500/50 hover:bg-sky-500/5 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold group-hover:text-sky-400 transition-colors">{a.name}</span>
                      <ChevronLeft className="w-5 h-5 rotate-180 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Login Screen */}
          {screen === 'login' && (
            <motion.div 
              key="login"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-md mx-auto"
            >
              <div className="bg-zinc-900/50 border border-white/10 rounded-3xl p-8 backdrop-blur-xl shadow-2xl">
                <div className="text-center mb-8">
                  <div className="w-16 h-16 bg-sky-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Lock className="w-8 h-8 text-sky-500" />
                  </div>
                  <h3 className="text-2xl font-bold">Login Required</h3>
                  <p className="text-zinc-500 text-sm mt-1">{selectedAcademy?.name}</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-1.5 ml-1">Mobile / Email</label>
                    <div className="relative">
                      <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input 
                        id="login-mobile"
                        type="text" 
                        placeholder="Enter your credentials"
                        className="w-full bg-black border border-white/10 rounded-xl py-3 pl-11 pr-4 focus:outline-none focus:border-sky-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-1.5 ml-1">Password</label>
                    <div className="relative">
                      <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input 
                        id="login-pass"
                        type="password" 
                        placeholder="••••••••"
                        className="w-full bg-black border border-white/10 rounded-xl py-3 pl-11 pr-4 focus:outline-none focus:border-sky-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="relative py-4">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5"></div></div>
                    <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-bold"><span className="bg-zinc-900 px-4 text-zinc-600">OR</span></div>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-1.5 ml-1">Auth Token</label>
                    <input 
                      id="login-token"
                      type="text" 
                      placeholder="Paste your token here"
                      className="w-full bg-black border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-sky-500 transition-colors font-mono text-xs"
                    />
                  </div>

                  <button 
                    onClick={async () => {
                      const mobile = (document.getElementById('login-mobile') as HTMLInputElement).value;
                      const pass = (document.getElementById('login-pass') as HTMLInputElement).value;
                      const token = (document.getElementById('login-token') as HTMLInputElement).value;
                      
                      if (token) {
                        setAuth({ token, userId: "-2", apiBase: selectedAcademy!.api });
                        localStorage.setItem('token', token);
                        localStorage.setItem('userid', "-2");
                        localStorage.setItem('api_base', selectedAcademy!.api);
                        setScreen('dashboard');
                      } else if (mobile && pass) {
                        try {
                          const res = await fetch(`${selectedAcademy!.api}/post/userLogin`, {
                            method: "POST",
                            headers: { "Auth-Key": "appxapi", "User-Id": "-2", "Content-Type": "application/x-www-form-urlencoded" },
                            body: `email=${mobile}&password=${pass}`,
                          });
                          const j = await res.json();
                          if (j.status === 200) {
                            const newAuth = { token: j.data.token, userId: j.data.userid, apiBase: selectedAcademy!.api };
                            setAuth(newAuth);
                            setShowTokenPopup(j.data.token);
                            localStorage.setItem('token', j.data.token);
                            localStorage.setItem('userid', j.data.userid);
                            localStorage.setItem('api_base', selectedAcademy!.api);
                            setScreen('dashboard');
                          } else {
                            alert("Login failed");
                          }
                        } catch (e) {
                          alert("Login error");
                        }
                      }
                    }}
                    className="w-full bg-sky-500 text-white font-bold py-4 rounded-xl hover:bg-sky-400 transition-colors shadow-lg shadow-sky-500/20"
                  >
                    Login
                  </button>

                  <button 
                    onClick={() => setScreen('otp')}
                    className="w-full text-zinc-500 text-sm font-semibold hover:text-zinc-300 transition-colors py-2"
                  >
                    Login with OTP
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* OTP Screen */}
          {screen === 'otp' && (
            <motion.div 
              key="otp"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-md mx-auto"
            >
              <div className="bg-zinc-900/50 border border-white/10 rounded-3xl p-8 backdrop-blur-xl shadow-2xl">
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold">OTP Login</h3>
                  <p className="text-zinc-500 text-sm mt-1">Enter your registered mobile</p>
                </div>

                <div className="space-y-4">
                  <input 
                    id="otp-mobile"
                    type="text" 
                    placeholder="Mobile Number"
                    className="w-full bg-black border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-sky-500 transition-colors"
                  />
                  <input 
                    id="otp-code"
                    type="text" 
                    placeholder="Enter OTP"
                    className="w-full bg-black border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-sky-500 transition-colors"
                  />
                  
                  <button 
                    onClick={async () => {
                      const mobile = (document.getElementById('otp-mobile') as HTMLInputElement).value;
                      await fetch(`${selectedAcademy!.api}/get/sendotp?phone=${mobile}`, {
                        headers: { "Client-Service": "Appx", "Auth-Key": "appxapi", source: "website" },
                      });
                      alert("OTP Sent");
                    }}
                    className="w-full bg-white/5 border border-white/10 text-white font-bold py-3 rounded-xl hover:bg-white/10 transition-colors"
                  >
                    Send OTP
                  </button>

                  <button 
                    onClick={async () => {
                      const mobile = (document.getElementById('otp-mobile') as HTMLInputElement).value;
                      const otp = (document.getElementById('otp-code') as HTMLInputElement).value;
                      const res = await fetch(`${selectedAcademy!.api}/get/otpverify?useremail=${mobile}&otp=${otp}`, {
                        headers: { "Client-Service": "Appx", "Auth-Key": "appxapi", source: "website" },
                      });
                      const j = await res.json();
                      if (j.status === 200) {
                        const newAuth = { token: j.user.token, userId: j.user.userid || "-2", apiBase: selectedAcademy!.api };
                        setAuth(newAuth);
                        setShowTokenPopup(j.user.token);
                        localStorage.setItem('token', j.user.token);
                        localStorage.setItem('userid', j.user.userid || "-2");
                        localStorage.setItem('api_base', selectedAcademy!.api);
                        setScreen('dashboard');
                      }
                    }}
                    className="w-full bg-sky-500 text-white font-bold py-4 rounded-xl hover:bg-sky-400 transition-colors shadow-lg shadow-sky-500/20"
                  >
                    Verify & Login
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Dashboard */}
          {screen === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-12"
            >
              {/* Favorites */}
              {favorites.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-6">
                    <Star className="w-5 h-5 text-amber-400 fill-current" />
                    <h2 className="text-xl font-bold tracking-tight">Favorites</h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {favorites.map(renderCourseCard)}
                  </div>
                </section>
              )}

              {/* Purchased */}
              {purchasedCourses.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-6">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    <h2 className="text-xl font-bold tracking-tight">My Courses</h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {purchasedCourses.map(renderCourseCard)}
                  </div>
                </section>
              )}

              {/* All Courses */}
              <section>
                <div className="flex items-center gap-2 mb-6">
                  <LayoutDashboard className="w-5 h-5 text-sky-500" />
                  <h2 className="text-xl font-bold tracking-tight">Explore All</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {courses.map(renderCourseCard)}
                </div>
                
                <button 
                  onClick={() => loadCourses()}
                  disabled={loading}
                  className="mt-8 w-full py-4 bg-zinc-900 border border-white/5 rounded-2xl text-zinc-400 font-bold hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Loading...' : 'Load More Courses'}
                </button>
              </section>
            </motion.div>
          )}

          {/* Course View */}
          {screen === 'course' && (
            <motion.div 
              key="course"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {/* Tabs */}
              <div className="flex p-1 bg-zinc-900 rounded-2xl max-w-md mx-auto">
                {(['live', 'recorded', 'folder'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === tab ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    {tab === 'live' && <Video className="w-4 h-4" />}
                    {tab === 'recorded' && <Clock className="w-4 h-4" />}
                    {tab === 'folder' && <Folder className="w-4 h-4" />}
                    <span className="capitalize">{tab}</span>
                  </button>
                ))}
              </div>

              {/* Player */}
              {playerUrl && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="aspect-video bg-black rounded-3xl overflow-hidden border border-white/10 shadow-2xl"
                >
                  {isHls ? (
                    <video ref={videoRef} controls className="w-full h-full" />
                  ) : (
                    <iframe src={playerUrl} className="w-full h-full" allowFullScreen allow="autoplay" />
                  )}
                </motion.div>
              )}

              {/* Content List */}
              <div className="grid gap-3">
                {videos.map((v, i) => (
                  <motion.div 
                    key={v.id || i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => playVideo(v)}
                    className="group flex items-center justify-between p-4 bg-zinc-900/50 border border-white/5 rounded-2xl hover:border-sky-500/50 hover:bg-sky-500/5 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-sky-500/20 transition-colors">
                        {activeTab === 'live' ? <Video className="w-5 h-5 text-red-500" /> : <Play className="w-5 h-5 text-sky-500" />}
                      </div>
                      <div>
                        <h4 className="font-bold text-zinc-100">{v.Title}</h4>
                        <p className="text-xs text-zinc-500 mt-0.5">{v.date_and_time}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {(v.download_link || v.download_links?.length) && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            const enc = v.download_links?.[0]?.path || v.download_link;
                            if (enc) window.open(getProxyUrl(decrypt(enc)), '_blank');
                          }}
                          className="p-2 hover:bg-white/10 rounded-lg text-zinc-500 hover:text-zinc-100 transition-colors"
                        >
                          <Download className="w-5 h-5" />
                        </button>
                      )}
                      <ChevronLeft className="w-5 h-5 rotate-180 text-zinc-700 group-hover:text-sky-500 transition-colors" />
                    </div>
                  </motion.div>
                ))}
                
                {activeTab === 'recorded' && videos.length > 0 && (
                  <button 
                    onClick={() => loadRecorded()}
                    className="w-full py-4 text-zinc-500 font-bold hover:text-zinc-300 transition-colors"
                  >
                    Load More Recorded
                  </button>
                )}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Token Popup */}
      <AnimatePresence>
        {showTokenPopup && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-zinc-900 border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-2xl"
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </div>
                <h3 className="text-2xl font-bold">Login Successful</h3>
                <p className="text-zinc-500 text-sm mt-1">Your secure login token</p>
              </div>

              <div className="bg-black rounded-xl p-4 flex items-center gap-3 border border-white/5 mb-6">
                <input 
                  readOnly 
                  value={showTokenPopup} 
                  className="bg-transparent border-none outline-none flex-1 font-mono text-[10px] text-zinc-400"
                />
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(showTokenPopup);
                    alert("Token copied!");
                  }}
                  className="p-2 hover:bg-white/5 rounded-lg text-sky-500 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>

              <button 
                onClick={() => setShowTokenPopup(null)}
                className="w-full bg-sky-500 text-white font-bold py-4 rounded-xl hover:bg-sky-400 transition-colors"
              >
                Continue to Dashboard
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed bottom-8 right-8 z-[60]">
          <div className="bg-sky-500 text-white px-4 py-2 rounded-full flex items-center gap-3 shadow-lg shadow-sky-500/20 animate-pulse">
            <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
            <span className="text-xs font-bold uppercase tracking-widest">Processing...</span>
          </div>
        </div>
      )}

    </div>
  );
}
