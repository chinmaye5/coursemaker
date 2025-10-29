'use client';

import { useState, useEffect, useRef } from 'react';

interface Chapter {
  title: string;
  time: string;
  url: string;
  timestamp: number;
}

interface ProgressData {
  [videoId: string]: {
    completedChapters: number[];
    lastWatchedChapter: number;
    progressPercentage: number;
    totalWatchTime: number;
    timestamp: number;
  };
}

export default function YouTubeCoursePlayer() {
  const [url, setUrl] = useState('');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [videoId, setVideoId] = useState('');
  const [progress, setProgress] = useState<ProgressData>({});
  const [currentChapter, setCurrentChapter] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [playerReady, setPlayerReady] = useState(false);

  const playerRef = useRef<any>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load progress from localStorage
  useEffect(() => {
    const savedProgress = localStorage.getItem('youtube-course-progress');
    if (savedProgress) {
      setProgress(JSON.parse(savedProgress));
    }
  }, []);

  // Save progress to localStorage
  useEffect(() => {
    localStorage.setItem('youtube-course-progress', JSON.stringify(progress));
  }, [progress]);

  const extractVideoId = (url: string) => {
    const match = url.match(
      /(?:v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
    );
    return match ? match[1] : null;
  };

  const parseTimeToSeconds = (timeStr: string): number => {
    const parts = timeStr.split(':').map(part => parseInt(part));
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return parts[0];
  };

  const fetchChapters = async () => {
    if (!url) {
      setError('Please enter a YouTube URL');
      return;
    }

    setLoading(true);
    setError('');
    setChapters([]);
    setPlayerReady(false);

    try {
      const id = extractVideoId(url);
      if (!id) {
        throw new Error('Invalid YouTube URL');
      }
      setVideoId(id);

      const response = await fetch('/api/youtube-chapters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videoId: id }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch chapters');
      }

      const data = await response.json();
      const chaptersWithTimestamps = data.chapters.map((chapter: Chapter) => ({
        ...chapter,
        timestamp: parseTimeToSeconds(chapter.time)
      }));
      setChapters(chaptersWithTimestamps);
      setPlayerReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const initializeYouTubePlayer = () => {
    if (!videoId || !window.YT) return;

    playerRef.current = new window.YT.Player('youtube-player', {
      videoId: videoId,
      playerVars: {
        playsinline: 1,
        rel: 0,
        modestbranding: 1,
      },
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange,
      },
    });
  };

  const onPlayerReady = (event: any) => {
    startProgressTracking();
  };

  const onPlayerStateChange = (event: any) => {
    if (event.data === window.YT.PlayerState.PLAYING) {
      startProgressTracking();
    } else if (event.data === window.YT.PlayerState.PAUSED || event.data === window.YT.PlayerState.ENDED) {
      stopProgressTracking();
    }
  };

  const startProgressTracking = () => {
    stopProgressTracking();
    progressIntervalRef.current = setInterval(trackProgress, 1000);
  };

  const stopProgressTracking = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  const trackProgress = () => {
    if (!playerRef.current || chapters.length === 0) return;

    const currentTime = playerRef.current.getCurrentTime();

    // Find current chapter based on timestamp
    let newCurrentChapter = 0;
    for (let i = chapters.length - 1; i >= 0; i--) {
      if (currentTime >= chapters[i].timestamp) {
        newCurrentChapter = i;
        break;
      }
    }

    if (newCurrentChapter !== currentChapter) {
      setCurrentChapter(newCurrentChapter);

      // Auto-mark previous chapters as completed
      if (newCurrentChapter > currentChapter) {
        setProgress(prev => {
          const videoProgress = prev[videoId] || {
            completedChapters: [],
            lastWatchedChapter: -1,
            progressPercentage: 0,
            totalWatchTime: 0,
            timestamp: Date.now()
          };

          const newCompletedChapters = [...new Set([
            ...videoProgress.completedChapters,
            ...Array.from({ length: newCurrentChapter }, (_, i) => i)
          ])];

          const progressPercentage = Math.round((newCompletedChapters.length / chapters.length) * 100);

          return {
            ...prev,
            [videoId]: {
              ...videoProgress,
              completedChapters: newCompletedChapters,
              lastWatchedChapter: newCurrentChapter,
              progressPercentage,
              totalWatchTime: videoProgress.totalWatchTime + 1,
              timestamp: Date.now()
            }
          };
        });
      }
    }
  };

  const seekToChapter = (chapterIndex: number) => {
    if (playerRef.current && chapters[chapterIndex]) {
      playerRef.current.seekTo(chapters[chapterIndex].timestamp, true);
      setCurrentChapter(chapterIndex);
    }
  };

  const markChapterCompleted = (chapterIndex: number) => {
    if (!videoId) return;

    setProgress(prev => {
      const videoProgress = prev[videoId] || {
        completedChapters: [],
        lastWatchedChapter: -1,
        progressPercentage: 0,
        totalWatchTime: 0,
        timestamp: Date.now()
      };

      const isCompleted = videoProgress.completedChapters.includes(chapterIndex);

      const newCompletedChapters = isCompleted
        ? videoProgress.completedChapters.filter(idx => idx !== chapterIndex)
        : [...videoProgress.completedChapters, chapterIndex];

      const progressPercentage = Math.round((newCompletedChapters.length / chapters.length) * 100);

      return {
        ...prev,
        [videoId]: {
          ...videoProgress,
          completedChapters: newCompletedChapters,
          lastWatchedChapter: chapterIndex,
          progressPercentage,
          timestamp: Date.now()
        }
      };
    });
  };

  const getVideoProgress = () => {
    if (!videoId || !progress[videoId]) return null;
    return progress[videoId];
  };

  const videoProgress = getVideoProgress();
  const progressPercentage = videoProgress?.progressPercentage || 0;

  // Load YouTube IFrame API
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = initializeYouTubePlayer;
    } else {
      initializeYouTubePlayer();
    }

    return () => {
      stopProgressTracking();
    };
  }, [videoId, playerReady]);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-gray-700"
            >
              ☰
            </button>
            <h1 className="text-xl font-bold">YouTube Course Player</h1>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-32 bg-gray-700 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>
              <span className="text-sm text-gray-300">{progressPercentage}%</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
            {/* Course Content */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 border-b border-gray-700">
                <h2 className="font-semibold text-lg mb-4">Course Content</h2>

                {/* URL Input */}
                <div className="space-y-3 mb-6">
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Paste YouTube URL..."
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    onKeyPress={(e) => e.key === 'Enter' && fetchChapters()}
                  />
                  <button
                    onClick={fetchChapters}
                    disabled={loading}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-sm"
                  >
                    {loading ? 'Loading Course...' : 'Load Course'}
                  </button>
                </div>

                {error && (
                  <div className="p-3 bg-red-900 border border-red-700 rounded text-sm">
                    ❌ {error}
                  </div>
                )}
              </div>

              {/* Chapters List */}
              {chapters.length > 0 && (
                <div className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium">{chapters.length} chapters</h3>
                    <span className="text-sm text-gray-400">{progressPercentage}% complete</span>
                  </div>

                  <div className="space-y-1">
                    {chapters.map((chapter, index) => {
                      const isCompleted = videoProgress?.completedChapters.includes(index);
                      const isCurrent = currentChapter === index;

                      return (
                        <div
                          key={index}
                          className={`p-3 rounded-lg cursor-pointer transition-all ${isCurrent
                              ? 'bg-blue-900 border border-blue-600'
                              : isCompleted
                                ? 'bg-green-900 border border-green-600'
                                : 'bg-gray-700 hover:bg-gray-600 border border-gray-600'
                            }`}
                          onClick={() => seekToChapter(index)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${isCompleted
                                  ? 'bg-green-500 text-white'
                                  : 'bg-gray-600 text-gray-300'
                                }`}>
                                {isCompleted ? '✓' : index + 1}
                              </div>
                              <div>
                                <h4 className={`text-sm font-medium ${isCompleted ? 'text-green-200' : 'text-white'
                                  }`}>
                                  {chapter.title}
                                </h4>
                                <p className="text-xs text-gray-400">{chapter.time}</p>
                              </div>
                            </div>

                            {isCurrent && (
                              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Progress Summary */}
            {videoProgress && (
              <div className="p-4 border-t border-gray-700 bg-gray-750">
                <h4 className="font-medium mb-2">Your Progress</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Completion:</span>
                    <span>{progressPercentage}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Chapters done:</span>
                    <span>{videoProgress.completedChapters.length}/{chapters.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Last watched:</span>
                    <span className="text-gray-400">
                      {new Date(videoProgress.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Video Player */}
          <div className="flex-1 bg-black relative">
            {playerReady ? (
              <div id="youtube-player" className="w-full h-full"></div>
            ) : chapters.length > 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <p>Loading player...</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <div className="text-6xl mb-4">🎬</div>
                  <h3 className="text-xl mb-2">No Video Loaded</h3>
                  <p>Enter a YouTube URL to start learning</p>
                </div>
              </div>
            )}
          </div>

          {/* Current Chapter Info */}
          {chapters.length > 0 && chapters[currentChapter] && (
            <div className="bg-gray-800 border-t border-gray-700 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg">
                    Now Playing: {chapters[currentChapter].title}
                  </h3>
                  <p className="text-gray-400">
                    Chapter {currentChapter + 1} of {chapters.length} • {chapters[currentChapter].time}
                  </p>
                </div>
                <button
                  onClick={() => markChapterCompleted(currentChapter)}
                  className={`px-4 py-2 rounded-lg font-medium ${videoProgress?.completedChapters.includes(currentChapter)
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                >
                  {videoProgress?.completedChapters.includes(currentChapter) ? 'Completed ✓' : 'Mark Complete'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Add YouTube types to window
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}