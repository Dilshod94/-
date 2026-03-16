/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  where, 
  limit,
  serverTimestamp,
  Timestamp,
  updateDoc,
  setDoc,
  getDoc,
  getDocs,
  doc
} from 'firebase/firestore';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult
} from 'firebase/auth';
import { db, auth } from './firebase';
import { translations, Language } from './translations';
import { GoogleGenAI, Modality } from "@google/genai";
import { 
  Plus, 
  Search, 
  LogOut, 
  User as UserIcon, 
  MapPin, 
  Phone, 
  Tag, 
  Globe,
  X,
  ChevronDown,
  Filter,
  Moon,
  Sun,
  TrendingUp,
  Calendar,
  ExternalLink,
  RefreshCw,
  Camera,
  Sparkles,
  MessageSquare,
  Star,
  Send,
  CheckCircle2,
  Clock,
  History,
  Mic,
  Volume2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  type: 'sale' | 'purchase';
  location: string;
  country: 'Tajikistan' | 'Uzbekistan';
  ownerId: string;
  ownerName: string;
  ownerPhone: string;
  createdAt: Timestamp;
  status: 'active' | 'sold' | 'archived' | 'baraka';
  breed?: string;
  finalPrice?: number;
  soldAt?: Timestamp;
}

interface Message {
  id: string;
  text: string;
  senderId: string;
  createdAt: Timestamp;
}

interface Chat {
  id: string;
  participants: string[];
  participantNames: { [key: string]: string };
  lastMessage?: string;
  updatedAt: Timestamp;
  listingId: string;
  listingTitle: string;
}

interface Transaction {
  id: string;
  listingId: string;
  listingTitle: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  price: number;
  currency: string;
  createdAt: Timestamp;
}

interface Review {
  id: string;
  targetUserId: string;
  authorId: string;
  authorName: string;
  rating: number;
  comment: string;
  createdAt: Timestamp;
}

interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  phoneNumber: string;
  photoURL: string;
  location: string;
  createdAt: Timestamp;
}

const RatingStars = ({ rating, count, className }: { rating: number, count?: number, className?: string }) => (
  <div className={cn("flex items-center gap-1", className)}>
    {[1, 2, 3, 4, 5].map((star) => (
      <Star
        key={star}
        size={14}
        className={cn(
          star <= Math.round(rating) ? "fill-yellow-400 text-yellow-400" : "text-stone-300 dark:text-stone-700"
        )}
      />
    ))}
    {count !== undefined && (
      <span className="text-[10px] font-bold text-stone-400 ml-1">({count})</span>
    )}
  </div>
);

const HoofLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M6 4C4.5 4 3 6 3 9C3 13 5 18 10 20C10.5 20.2 11 20 11 19V11C11 9 10 4 6 4Z" />
    <path d="M18 4C19.5 4 21 6 21 9C21 13 19 18 14 20C13.5 20.2 13 20 13 19V11C13 9 14 4 18 4Z" />
  </svg>
);

export default function App() {
  const [lang, setLang] = useState<Language>('ru');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [filterCountry, setFilterCountry] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterBreed, setFilterBreed] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'sold'>('active');
  const [filterMinPrice, setFilterMinPrice] = useState<number>(0);
  const [filterMaxPrice, setFilterMaxPrice] = useState<number>(1000000);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'listings' | 'market'>('listings');
  const [marketData, setMarketData] = useState<{
    prices: any;
    markets: any[];
    loading: boolean;
  }>({ prices: null, markets: [], loading: false });

  // Phone Auth State
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [phoneLoading, setPhoneLoading] = useState(false);

  // AI Camera State
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [aiResult, setAiResult] = useState<{ breed: string; price: string; info: string } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Chat State
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatMessage, setChatMessage] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatListOpen, setIsChatListOpen] = useState(false);

  // Baraka State
  const [isBarakaModalOpen, setIsBarakaModalOpen] = useState(false);
  const [barakaPrice, setBarakaPrice] = useState('');
  const [barakaListing, setBarakaListing] = useState<Listing | null>(null);

  // Bargain State
  const [isBargainModalOpen, setIsBargainModalOpen] = useState(false);
  const [bargainPrice, setBargainPrice] = useState('');

  // Profile State
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileTab, setProfileTab] = useState<'listings' | 'transactions' | 'reviews' | 'edit'>('listings');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userListings, setUserListings] = useState<Listing[]>([]);
  const [userTransactions, setUserTransactions] = useState<Transaction[]>([]);
  const [userReviews, setUserReviews] = useState<Review[]>([]);
  const [editProfileData, setEditProfileData] = useState({ displayName: '', phoneNumber: '', location: '' });

  // Public Profile State
  const [publicProfileUser, setPublicProfileUser] = useState<UserProfile | null>(null);
  const [publicProfileListings, setPublicProfileListings] = useState<Listing[]>([]);
  const [isPublicProfileOpen, setIsPublicProfileOpen] = useState(false);

  // Voice Assistant State
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'listening' | 'processing' | 'speaking'>('idle');
  const [voiceText, setVoiceText] = useState('');
  const [voiceResponse, setVoiceResponse] = useState('');

  // Review Submission State
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [hasReviewed, setHasReviewed] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const t = translations[lang];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userRef = doc(db, 'users', u.uid);
        onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as UserProfile;
            setUserProfile(data);
            setEditProfileData({
              displayName: data.displayName || '',
              phoneNumber: data.phoneNumber || '',
              location: data.location || ''
            });
          } else {
            setDoc(userRef, {
              uid: u.uid,
              displayName: u.displayName || 'User',
              email: u.email || '',
              phoneNumber: u.phoneNumber || '',
              photoURL: u.photoURL || '',
              location: '',
              createdAt: serverTimestamp()
            });
          }
        });
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch user data for profile modal
  useEffect(() => {
    if (!user || !isProfileModalOpen) return;

    // My Listings
    const qListings = query(
      collection(db, 'listings'),
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubListings = onSnapshot(qListings, (snapshot) => {
      setUserListings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Listing[]);
    });

    // Transactions (Sales and Purchases)
    const qSales = query(
      collection(db, 'transactions'),
      where('sellerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const qPurchases = query(
      collection(db, 'transactions'),
      where('buyerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubSales = onSnapshot(qSales, (snapshot) => {
      const sales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Transaction[];
      setUserTransactions(prev => {
        const others = prev.filter(t => t.buyerId === user.uid);
        return [...sales, ...others].sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
      });
    });

    const unsubPurchases = onSnapshot(qPurchases, (snapshot) => {
      const purchases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Transaction[];
      setUserTransactions(prev => {
        const others = prev.filter(t => t.sellerId === user.uid);
        return [...purchases, ...others].sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
      });
    });

    // Reviews
    const qReviews = query(
      collection(db, 'users', user.uid, 'reviews'),
      orderBy('createdAt', 'desc')
    );
    const unsubReviews = onSnapshot(qReviews, (snapshot) => {
      setUserReviews(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Review[]);
    });

    return () => {
      unsubListings();
      unsubSales();
      unsubPurchases();
      unsubReviews();
    };
  }, [user, isProfileModalOpen]);

  useEffect(() => {
    let q = query(collection(db, 'listings'), orderBy('createdAt', 'desc'));
    
    if (filterCountry !== 'all') {
      q = query(q, where('country', '==', filterCountry));
    }
    if (filterCategory !== 'all') {
      q = query(q, where('category', '==', filterCategory));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;

      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Listing[];

      // Apply granular filters client-side
      let filtered = docs.filter(listing => {
        // Status Filter
        if (filterStatus === 'active') {
          if (listing.status !== 'active' && listing.status !== 'baraka') return false;
          if (listing.status === 'baraka' && listing.soldAt) {
            const soldTime = listing.soldAt.toMillis();
            if ((now - soldTime) >= oneDay) return false;
          }
        } else if (filterStatus === 'sold') {
          if (listing.status !== 'sold' && listing.status !== 'baraka') return false;
          if (listing.status === 'baraka' && listing.soldAt) {
            const soldTime = listing.soldAt.toMillis();
            if ((now - soldTime) < oneDay) return false;
          }
        }

        // Breed Filter (if specifically set in filters)
        if (filterBreed && !listing.breed?.toLowerCase().includes(filterBreed.toLowerCase())) {
          return false;
        }

        // Price Filter
        if (listing.price < filterMinPrice || listing.price > filterMaxPrice) {
          return false;
        }

        // Search Query Filter (if set)
        if (searchQuery) {
          const searchLower = searchQuery.toLowerCase();
          const matchesTitle = listing.title.toLowerCase().includes(searchLower);
          const matchesDesc = listing.description.toLowerCase().includes(searchLower);
          const matchesBreed = listing.breed?.toLowerCase().includes(searchLower);
          const matchesLocation = listing.location.toLowerCase().includes(searchLower);
          
          if (!matchesTitle && !matchesDesc && !matchesBreed && !matchesLocation) {
            return false;
          }
        }

        return true;
      });

      // Apply intelligent scoring and sorting
      filtered = filtered.sort((a, b) => {
        const getScore = (listing: Listing) => {
          let score = 0;
          const searchLower = searchQuery.toLowerCase();
          const userLocLower = userProfile?.location?.toLowerCase() || '';

          // Breed Priority
          if (searchLower) {
            if (listing.breed?.toLowerCase() === searchLower) score += 1000;
            else if (listing.breed?.toLowerCase().includes(searchLower)) score += 500;
            
            if (listing.title.toLowerCase() === searchLower) score += 800;
            else if (listing.title.toLowerCase().includes(searchLower)) score += 300;
          }

          // Filter Breed Priority
          if (filterBreed) {
            if (listing.breed?.toLowerCase() === filterBreed.toLowerCase()) score += 2000;
          }

          // Location Weighting
          if (userLocLower) {
            if (listing.location.toLowerCase() === userLocLower) score += 600;
            else if (listing.location.toLowerCase().includes(userLocLower) || userLocLower.includes(listing.location.toLowerCase())) score += 300;
          }

          // Recency bonus
          const ageInDays = (now - listing.createdAt.toMillis()) / oneDay;
          score += Math.max(0, 100 - ageInDays);

          return score;
        };

        return getScore(b) - getScore(a);
      });

      setListings(filtered);
    });

    return () => unsubscribe();
  }, [filterCountry, filterCategory, filterBreed, filterStatus, filterMinPrice, filterMaxPrice, searchQuery, userProfile]);

  useEffect(() => {
    if (!selectedListing) {
      setComments([]);
      return;
    }

    const q = query(
      collection(db, 'listings', selectedListing.id, 'comments'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setComments(docs);
    });

    // Fetch transaction if listing is sold
    if (selectedListing.status === 'baraka') {
      const qTx = query(
        collection(db, 'transactions'),
        where('listingId', '==', selectedListing.id),
        limit(1)
      );
      getDocs(qTx).then(snap => {
        if (!snap.empty) {
          const tx = { id: snap.docs[0].id, ...snap.docs[0].data() } as Transaction;
          setSelectedTransaction(tx);
          
          // Check if user already reviewed
          if (user) {
            const qReview = query(
              collection(db, 'reviews'),
              where('authorId', '==', user.uid),
              where('targetUserId', '==', tx.sellerId),
              where('listingId', '==', tx.listingId)
            );
            getDocs(qReview).then(rSnap => {
              setHasReviewed(!rSnap.empty);
            });
          }
        }
      });
    } else {
      setSelectedTransaction(null);
      setHasReviewed(false);
    }

    return () => unsubscribe();
  }, [selectedListing, user]);

  // Listen for user's chats
  useEffect(() => {
    if (selectedListing) {
      const quailSounds = [
        'https://www.bird-sounds.net/sounds/common-quail.mp3',
        'https://www.bird-sounds.net/sounds/california-quail.mp3',
        'https://www.bird-sounds.net/sounds/mountain-quail.mp3',
        'https://www.bird-sounds.net/sounds/gambels-quail.mp3'
      ];
      const randomSound = quailSounds[Math.floor(Math.random() * quailSounds.length)];
      const audio = new Audio(randomSound);
      audio.volume = 0.3;
      // Play only a short snippet (1-2 seconds)
      audio.play().then(() => {
        setTimeout(() => {
          // Fade out or just stop
          const fadeOut = setInterval(() => {
            if (audio.volume > 0.05) {
              audio.volume -= 0.05;
            } else {
              audio.pause();
              clearInterval(fadeOut);
            }
          }, 100);
        }, 1500);
      }).catch(e => console.log("Audio playback blocked by browser", e));
    }
  }, [selectedListing]);

  useEffect(() => {
    if (!user) {
      setChats([]);
      return;
    }

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Chat[];
      setChats(docs);
    });

    return () => unsubscribe();
  }, [user]);

  // Listen for messages in active chat
  useEffect(() => {
    if (!activeChat) {
      setMessages([]);
      return;
    }

    const q = query(
      collection(db, 'chats', activeChat.id, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Message[];
      setMessages(docs);
    });

    return () => unsubscribe();
  }, [activeChat]);

  const handleLogin = () => {
    setShowLoginModal(true);
  };

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setShowLoginModal(false);
    } catch (error: any) {
      if (error.code !== 'auth/popup-closed-by-user') {
        setErrorMsg(error.message);
      }
    }
  };

  const setupRecaptcha = () => {
    if (!(window as any).recaptchaVerifier) {
      (window as any).recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible'
      });
    }
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneLoading(true);
    try {
      setupRecaptcha();
      const appVerifier = (window as any).recaptchaVerifier;
      const confirmation = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
      setConfirmationResult(confirmation);
    } catch (error: any) {
      setErrorMsg(error.message);
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmationResult) return;
    setPhoneLoading(true);
    try {
      await confirmationResult.confirm(verificationCode);
      setShowLoginModal(false);
      setConfirmationResult(null);
      setVerificationCode('');
      setPhoneNumber('');
    } catch (error: any) {
      setErrorMsg(error.message);
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleLogout = () => signOut(auth);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setCameraStream(stream);
      if (videoRef.current) videoRef.current.srcObject = stream;
      setIsCameraOpen(true);
      setAiResult(null);
    } catch (err) {
      setErrorMsg("Camera access denied");
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsCameraOpen(false);
  };

  const analyzeAnimal = async () => {
    if (!videoRef.current) return;
    setIsAnalyzing(true);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(videoRef.current, 0, 0);
      const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { inlineData: { data: base64Image, mimeType: "image/jpeg" } },
              { text: `Analyze this animal. Provide its breed/type, health estimation, and approximate market value in Tajikistan and Uzbekistan. 
              Format response as JSON with keys: "breed" (string), "price" (string with range in TJS/UZS) and "info" (brief description).` }
            ]
          }
        ],
        config: { responseMimeType: "application/json" }
      });

      const result = JSON.parse(response.text || '{}');
      setAiResult(result);
    } catch (error) {
      console.error("AI Analysis failed:", error);
      setErrorMsg("AI Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startVoiceAssistant = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return;
    }

    setIsVoiceActive(true);
    setVoiceStatus('listening');
    setVoiceText('');
    setVoiceResponse('');

    const recognition = new SpeechRecognition();
    recognition.lang = lang === 'ru' ? 'ru-RU' : lang === 'uz' ? 'uz-UZ' : 'tg-TJ';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript;
      setVoiceText(transcript);
      setVoiceStatus('processing');
      
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `The user said: "${transcript}". 
          This is an app for buying/selling livestock (cows, sheep, horses, etc.) in Tajikistan and Uzbekistan.
          Available listings: ${listings.slice(0, 10).map(l => `${l.title} for ${l.price} ${l.currency} in ${l.location}`).join(', ')}.
          Provide a helpful, short response in ${lang === 'ru' ? 'Russian' : lang === 'uz' ? 'Uzbek' : 'Tajik'}.
          If they are looking for something, tell them what's available. 
          Keep it very concise (max 2 sentences).`
        });

        const textResponse = response.text || "Sorry, I couldn't process that.";
        setVoiceResponse(textResponse);
        setVoiceStatus('speaking');
        speak(textResponse);
      } catch (error) {
        console.error("Voice AI error:", error);
        setVoiceStatus('idle');
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setVoiceStatus('idle');
    };

    recognition.onend = () => {
      if (voiceStatus === 'listening') {
        // setVoiceStatus('idle');
      }
    };

    recognition.start();
  };

  const speak = async (text: string) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);
        audio.onended = () => {
          setVoiceStatus('idle');
          setTimeout(() => setIsVoiceActive(false), 3000);
        };
        audio.play();
      } else {
        throw new Error("No audio data");
      }
    } catch (error) {
      console.error("TTS error:", error);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang === 'ru' ? 'ru-RU' : lang === 'uz' ? 'uz-UZ' : 'tg-TJ';
      utterance.onend = () => {
        setVoiceStatus('idle');
        setTimeout(() => setIsVoiceActive(false), 3000);
      };
      window.speechSynthesis.speak(utterance);
    }
  };

  const startChat = async (listing: Listing) => {
    if (!user) {
      setShowLoginModal(true);
      return;
    }

    if (user.uid === listing.ownerId) return;

    // Check if chat already exists
    const existingChat = chats.find(c => c.listingId === listing.id && c.participants.includes(user.uid));
    
    if (existingChat) {
      setActiveChat(existingChat);
      setIsChatOpen(true);
      return;
    }

    // Create new chat
    try {
      const chatData = {
        participants: [user.uid, listing.ownerId],
        participantNames: {
          [user.uid]: user.displayName || 'User',
          [listing.ownerId]: listing.ownerName
        },
        listingId: listing.id,
        listingTitle: listing.title,
        updatedAt: serverTimestamp(),
      };
      const docRef = await addDoc(collection(db, 'chats'), chatData);
      
      // Pre-fill message context
      setChatMessage(`${t.interestedInListing}: "${listing.title}"`);
      
      setActiveChat({ id: docRef.id, ...chatData } as any);
      setIsChatOpen(true);
    } catch (error) {
      console.error("Error starting chat:", error);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeChat || !chatMessage.trim()) return;

    const messageText = chatMessage.trim();
    setChatMessage('');

    try {
      await addDoc(collection(db, 'chats', activeChat.id, 'messages'), {
        text: messageText,
        senderId: user.uid,
        createdAt: serverTimestamp(),
      });

      // Update last message in chat doc
      const chatRef = collection(db, 'chats');
      // Note: In a real app we'd use updateDoc, but for simplicity we'll just let it be
      // or implement a proper update if needed.
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const handleMarkAsSold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barakaListing || !barakaPrice || !user || !activeChat) return;

    try {
      const buyerId = activeChat.participants.find(p => p !== barakaListing.ownerId);
      const buyerName = activeChat.participantNames[buyerId || ''] || 'Buyer';

      await updateDoc(doc(db, 'listings', barakaListing.id), {
        status: 'baraka',
        finalPrice: Number(barakaPrice),
        soldAt: serverTimestamp()
      });

      // Create transaction record
      await addDoc(collection(db, 'transactions'), {
        listingId: barakaListing.id,
        listingTitle: barakaListing.title,
        buyerId: buyerId || 'unknown',
        buyerName: buyerName,
        sellerId: barakaListing.ownerId,
        sellerName: barakaListing.ownerName,
        price: Number(barakaPrice),
        currency: barakaListing.currency,
        createdAt: serverTimestamp()
      });

      setIsBarakaModalOpen(false);
      setBarakaListing(null);
      setBarakaPrice('');
    } catch (error) {
      console.error("Error marking as sold:", error);
    }
  };

  const handleSendBargain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedListing || !bargainPrice) return;

    try {
      // Ensure chat exists or create one
      let chatId = '';
      const existingChat = chats.find(c => c.listingId === selectedListing.id && c.participants.includes(user.uid));
      
      if (existingChat) {
        chatId = existingChat.id;
      } else {
        const chatData = {
          participants: [user.uid, selectedListing.ownerId],
          participantNames: {
            [user.uid]: user.displayName || 'User',
            [selectedListing.ownerId]: selectedListing.ownerName
          },
          listingId: selectedListing.id,
          listingTitle: selectedListing.title,
          updatedAt: serverTimestamp(),
        };
        const docRef = await addDoc(collection(db, 'chats'), chatData);
        chatId = docRef.id;
      }

      // Send the offer message
      const offerMessage = `${t.yourOffer}: ${bargainPrice} ${selectedListing.currency}`;
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        text: offerMessage,
        senderId: user.uid,
        createdAt: serverTimestamp(),
      });

      setIsBargainModalOpen(false);
      setBargainPrice('');
      setSelectedListing(null);
      setIsChatListOpen(true);
    } catch (error) {
      console.error("Error sending bargain:", error);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        ...editProfileData,
        updatedAt: serverTimestamp()
      });
      setIsProfileModalOpen(false);
    } catch (error) {
      console.error("Error updating profile:", error);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedTransaction || isSubmittingReview) return;

    setIsSubmittingReview(true);
    try {
      const reviewData = {
        targetUserId: selectedTransaction.sellerId,
        authorId: user.uid,
        authorName: userProfile?.displayName || user.email || 'User',
        rating: reviewRating,
        comment: reviewComment,
        listingId: selectedTransaction.listingId,
        createdAt: serverTimestamp()
      };

      // Add to global reviews collection
      await addDoc(collection(db, 'reviews'), reviewData);
      
      // Add to user's reviews subcollection
      await addDoc(collection(db, 'users', selectedTransaction.sellerId, 'reviews'), reviewData);

      setHasReviewed(true);
      setReviewComment('');
      setReviewRating(5);
    } catch (error) {
      console.error("Error submitting review:", error);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const openPublicProfile = async (userId: string) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        setPublicProfileUser(userDoc.data() as UserProfile);
        
        const q = query(
          collection(db, 'listings'),
          where('ownerId', '==', userId),
          where('status', '==', 'active'),
          orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);
        setPublicProfileListings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Listing[]);
        setIsPublicProfileOpen(true);
      }
    } catch (error) {
      console.error("Error fetching public profile:", error);
    }
  };

  const fetchMarketData = async () => {
    setMarketData(prev => ({ ...prev, loading: true }));
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      // Get user location for maps grounding
      let location = { latitude: 38.5358, longitude: 68.7791 }; // Default to Dushanbe
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject);
        });
        location = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      } catch (e) {
        console.log("Geolocation failed, using default");
      }

      // Fetch Prices using Search Grounding
      const priceResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Provide current average market prices for beef, mutton, wheat, and corn in Tajikistan and Uzbekistan. 
        Format as JSON with keys: beef_tj, mutton_tj, wheat_tj, corn_tj, beef_uz, mutton_uz, wheat_uz, corn_uz. 
        Values should be numbers in local currency (TJS/UZS).`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json"
        }
      });

      // Fetch Markets using Maps Grounding
      const marketResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: "Find animal markets (cattle markets) in Tajikistan and Uzbekistan. Tell me where and when they take place (days of the week).",
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig: {
              latLng: location
            }
          }
        }
      });

      const prices = JSON.parse(priceResponse.text || '{}');
      const groundingChunks = marketResponse.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const markets = groundingChunks
        .filter((c: any) => c.maps)
        .map((c: any) => ({
          title: c.maps.title,
          uri: c.maps.uri
        }));

      setMarketData({
        prices,
        markets,
        loading: false
      });
    } catch (error) {
      console.error("Error fetching market data:", error);
      setMarketData(prev => ({ ...prev, loading: false }));
      setErrorMsg("Failed to fetch market data");
    }
  };

  useEffect(() => {
    if (activeTab === 'market' && !marketData.prices) {
      fetchMarketData();
    }
  }, [activeTab]);

  const [newListing, setNewListing] = useState({
    title: '',
    description: '',
    breed: '',
    price: '',
    currency: 'TJS',
    category: 'cows',
    type: 'sale' as 'sale' | 'purchase',
    location: '',
    country: 'Tajikistan' as 'Tajikistan' | 'Uzbekistan',
    phone: ''
  });

  const handleSubmitListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      await addDoc(collection(db, 'listings'), {
        ...newListing,
        price: Number(newListing.price),
        ownerId: user.uid,
        ownerName: user.displayName,
        ownerPhone: newListing.phone,
        createdAt: serverTimestamp(),
        status: 'active'
      });
      setIsModalOpen(false);
      setNewListing({
        title: '',
        description: '',
        breed: '',
        price: '',
        currency: 'TJS',
        category: 'cows',
        type: 'sale',
        location: '',
        country: 'Tajikistan',
        phone: ''
      });
    } catch (error) {
      console.error("Error adding listing:", error);
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedListing || !newComment.trim()) return;

    try {
      await addDoc(collection(db, 'listings', selectedListing.id, 'comments'), {
        text: newComment,
        authorId: user.uid,
        authorName: user.displayName,
        createdAt: serverTimestamp()
      });
      setNewComment('');
    } catch (error) {
      console.error("Error adding comment:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className={cn(
      "min-h-screen font-sans transition-colors duration-500 relative",
      isDarkMode ? "dark bg-stone-950 text-stone-100" : "bg-stone-50 text-stone-900"
    )}>
      {/* Nature Background */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-20 transition-opacity duration-1000">
        <img 
          src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&q=80&w=2000" 
          alt="Nature Background"
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
        <div className={cn(
          "absolute inset-0",
          isDarkMode ? "bg-gradient-to-b from-stone-950 via-transparent to-stone-950" : "bg-gradient-to-b from-stone-50 via-transparent to-stone-50"
        )} />
      </div>

      {/* Header */}
      <header className={cn(
        "sticky top-0 z-40 backdrop-blur-md border-b transition-all duration-300",
        isDarkMode ? "bg-stone-900/80 border-stone-800" : "bg-white/80 border-stone-200"
      )}>
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-stone-900 rounded-xl flex items-center justify-center text-white shadow-lg shadow-stone-400/20">
              <HoofLogo className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-black tracking-tighter hidden sm:block italic">BAQARA</h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Theme Toggle */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={cn(
                "p-2 rounded-full transition-all",
                isDarkMode ? "bg-stone-800 text-yellow-400 hover:bg-stone-700" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              )}
              title={isDarkMode ? t.lightMode : t.darkMode}
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            {/* Language Switcher */}
            <div className={cn(
              "flex items-center rounded-full p-1",
              isDarkMode ? "bg-stone-800" : "bg-stone-100"
            )}>
              {(['ru', 'uz', 'tj'] as Language[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-full transition-all",
                    lang === l 
                      ? (isDarkMode ? "bg-stone-700 text-emerald-400 shadow-sm" : "bg-white text-emerald-600 shadow-sm")
                      : (isDarkMode ? "text-stone-400 hover:text-stone-200" : "text-stone-500 hover:text-stone-700")
                  )}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              {user && (
                <>
                  <button 
                    onClick={() => setIsProfileModalOpen(true)}
                    className={cn(
                      "p-2 rounded-xl transition-all",
                      isDarkMode ? "bg-stone-800 text-stone-300 hover:bg-stone-700" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                    )}
                    title={t.profile}
                  >
                    <UserIcon size={20} />
                  </button>
                  <button 
                    onClick={() => setIsChatListOpen(true)}
                    className={cn(
                      "p-2 rounded-xl transition-all relative",
                      isDarkMode ? "bg-stone-800 text-stone-300 hover:bg-stone-700" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                    )}
                  >
                    <MessageSquare size={20} />
                    {chats.length > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                        {chats.length}
                      </span>
                    )}
                  </button>
                </>
              )}
              <button 
                onClick={() => user ? setIsModalOpen(true) : handleLogin()}
                className="bg-emerald-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100"
              >
                <Plus size={18} />
                <span className="hidden sm:inline">{t.createListing}</span>
              </button>
              {user ? (
                <button onClick={handleLogout} className={cn(
                  "p-2 transition-colors",
                  isDarkMode ? "text-stone-400 hover:text-red-400" : "text-stone-500 hover:text-red-600"
                )}>
                  <LogOut size={20} />
                </button>
              ) : (
                <button 
                  onClick={handleLogin}
                  className={cn(
                    "px-6 py-2 rounded-xl font-medium transition-all",
                    isDarkMode ? "bg-stone-100 text-stone-900 hover:bg-white" : "bg-stone-900 text-white hover:bg-stone-800"
                  )}
                >
                  {t.login}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 relative z-10">
        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-stone-200 dark:border-stone-800">
          <button
            onClick={() => setActiveTab('listings')}
            className={cn(
              "pb-4 px-2 font-bold transition-all relative",
              activeTab === 'listings' 
                ? "text-emerald-600" 
                : "text-stone-400 hover:text-stone-600"
            )}
          >
            {t.listings}
            {activeTab === 'listings' && (
              <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-600 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('market')}
            className={cn(
              "pb-4 px-2 font-bold transition-all relative",
              activeTab === 'market' 
                ? "text-emerald-600" 
                : "text-stone-400 hover:text-stone-600"
            )}
          >
            {t.marketInfo}
            {activeTab === 'market' && (
              <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-600 rounded-full" />
            )}
          </button>
        </div>

        {/* Error Message */}
        <AnimatePresence>
          {errorMsg && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={cn(
                "mb-6 p-4 border rounded-2xl flex items-center justify-between",
                isDarkMode ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border border-red-200 text-red-600"
              )}
            >
              <span className="font-medium">{t.error}: {errorMsg}</span>
              <button onClick={() => setErrorMsg(null)} className="p-1 hover:bg-red-100/10 rounded-full">
                <X size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filters and Listings */}
        {activeTab === 'listings' && (
          <>
            <div className="flex flex-col gap-4 mb-8">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={20} />
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.searchPlaceholder}
                  className={cn(
                    "w-full pl-12 pr-4 py-4 border rounded-[24px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-lg shadow-sm",
                    isDarkMode ? "bg-stone-900 border-stone-800 text-stone-100 placeholder-stone-600" : "bg-white border-stone-200 text-stone-900 placeholder-stone-400"
                  )}
                />
              </div>

              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 flex gap-4">
                  <div className="relative flex-1">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                    <select 
                      value={filterCountry}
                      onChange={(e) => setFilterCountry(e.target.value)}
                      className={cn(
                        "w-full pl-10 pr-4 py-3 border rounded-2xl appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all",
                        isDarkMode ? "bg-stone-900 border-stone-800 text-stone-100" : "bg-white border-stone-200 text-stone-900"
                      )}
                    >
                      <option value="all">{t.allCountries}</option>
                      <option value="Tajikistan">{t.tajikistan}</option>
                      <option value="Uzbekistan">{t.uzbekistan}</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" size={18} />
                  </div>

                  <div className="relative flex-1">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                    <select 
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className={cn(
                        "w-full pl-10 pr-4 py-3 border rounded-2xl appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all",
                        isDarkMode ? "bg-stone-900 border-stone-800 text-stone-100" : "bg-white border-stone-200 text-stone-900"
                      )}
                    >
                      <option value="all">{t.all}</option>
                      {Object.entries(t.categoriesList).map(([key, value]) => (
                        <option key={key} value={key}>{value}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" size={18} />
                  </div>
                </div>

                <button 
                  onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
                  className={cn(
                    "px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all",
                    isFilterMenuOpen 
                      ? "bg-emerald-600 text-white" 
                      : (isDarkMode ? "bg-stone-900 border border-stone-800 text-stone-300" : "bg-white border border-stone-200 text-stone-600")
                  )}
                >
                  <Filter size={18} />
                  {t.filters}
                </button>
              </div>

              <AnimatePresence>
                {isFilterMenuOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className={cn(
                      "p-6 rounded-3xl border grid grid-cols-1 md:grid-cols-3 gap-6",
                      isDarkMode ? "bg-stone-900 border-stone-800" : "bg-white border-stone-200 shadow-sm"
                    )}>
                      {/* Breed Filter */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-stone-400">{t.breed}</label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
                          <input 
                            type="text"
                            value={filterBreed}
                            onChange={(e) => setFilterBreed(e.target.value)}
                            placeholder={t.breed}
                            className={cn(
                              "w-full pl-10 pr-4 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm",
                              isDarkMode ? "bg-stone-800 border-stone-700" : "bg-stone-50 border-stone-200"
                            )}
                          />
                        </div>
                      </div>

                      {/* Status Filter */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-stone-400">{t.status}</label>
                        <div className={cn(
                          "flex p-1 rounded-xl",
                          isDarkMode ? "bg-stone-800" : "bg-stone-50"
                        )}>
                          {(['all', 'active', 'sold'] as const).map((s) => (
                            <button
                              key={s}
                              onClick={() => setFilterStatus(s)}
                              className={cn(
                                "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all",
                                filterStatus === s 
                                  ? (isDarkMode ? "bg-stone-700 text-emerald-400 shadow-sm" : "bg-white text-emerald-600 shadow-sm")
                                  : "text-stone-400 hover:text-stone-600"
                              )}
                            >
                              {s === 'all' ? t.all : s === 'active' ? t.active : t.sold}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Price Range Filter */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-stone-400">{t.price}</label>
                        <div className="flex items-center gap-2">
                          <input 
                            type="number"
                            value={filterMinPrice}
                            onChange={(e) => setFilterMinPrice(Number(e.target.value))}
                            placeholder={t.minPrice}
                            className={cn(
                              "w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm",
                              isDarkMode ? "bg-stone-800 border-stone-700" : "bg-stone-50 border-stone-200"
                            )}
                          />
                          <span className="text-stone-400">-</span>
                          <input 
                            type="number"
                            value={filterMaxPrice}
                            onChange={(e) => setFilterMaxPrice(Number(e.target.value))}
                            placeholder={t.maxPrice}
                            className={cn(
                              "w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm",
                              isDarkMode ? "bg-stone-800 border-stone-700" : "bg-stone-50 border-stone-200"
                            )}
                          />
                        </div>
                      </div>

                      <div className="md:col-span-3 flex justify-end">
                        <button 
                          onClick={() => {
                            setFilterBreed('');
                            setFilterStatus('active');
                            setFilterMinPrice(0);
                            setFilterMaxPrice(1000000);
                            setSearchQuery('');
                          }}
                          className="text-xs font-bold text-stone-400 hover:text-stone-600 flex items-center gap-1"
                        >
                          <RefreshCw size={12} />
                          {t.resetFilters}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Listings Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              <AnimatePresence mode="popLayout">
                {listings.length > 0 ? (
                  listings.map((listing) => (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      key={listing.id}
                      onClick={() => setSelectedListing(listing)}
                      className={cn(
                        "rounded-3xl border overflow-hidden transition-all group cursor-pointer",
                        isDarkMode 
                          ? "bg-stone-900 border-stone-800 hover:shadow-xl hover:shadow-emerald-900/20" 
                          : "bg-white border-stone-200 hover:shadow-xl hover:shadow-stone-200/50"
                      )}
                    >
                      <div className={cn(
                        "aspect-[4/3] relative overflow-hidden",
                        isDarkMode ? "bg-stone-800" : "bg-stone-100"
                      )}>
                        <img 
                          src={`https://picsum.photos/seed/${listing.id}/400/300`} 
                          alt={listing.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute top-3 left-3 flex gap-2">
                          <span className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                            listing.type === 'sale' ? "bg-emerald-500 text-white" : "bg-blue-500 text-white"
                          )}>
                            {listing.type === 'sale' ? t.sale : t.purchase}
                          </span>
                        </div>
                      </div>
                      <div className="p-5">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-bold text-lg line-clamp-1">{listing.title}</h3>
                          {listing.status === 'baraka' && (
                            <span className="bg-orange-500 text-white px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                              <CheckCircle2 size={10} />
                              {t.baraka}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mb-3">
                          <RatingStars rating={4.8} count={24} />
                        </div>
                        {listing.status === 'baraka' ? (
                          <div className="flex flex-col mb-4">
                            <span className="text-xs font-bold text-stone-400 line-through">{listing.price.toLocaleString()} {listing.currency}</span>
                            <span className="text-xl font-black text-orange-600">{t.soldFor}: {listing.finalPrice?.toLocaleString()} {listing.currency}</span>
                          </div>
                        ) : (
                          <p className="text-emerald-600 dark:text-emerald-400 font-bold text-xl mb-4">
                            {listing.price.toLocaleString()} {listing.currency}
                          </p>
                        )}
                        <div className={cn(
                          "space-y-2 text-sm",
                          isDarkMode ? "text-stone-400" : "text-stone-500"
                        )}>
                          <div className="flex items-center gap-2">
                            <MapPin size={14} />
                            <span className="line-clamp-1">{listing.location}, {listing.country === 'Tajikistan' ? t.tajikistan : t.uzbekistan}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <UserIcon size={14} />
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                openPublicProfile(listing.ownerId);
                              }}
                              className="hover:text-emerald-600 transition-colors"
                            >
                              {listing.ownerName}
                            </button>
                          </div>
                          <div className={cn(
                            "flex items-center gap-2 font-medium pt-2",
                            isDarkMode ? "text-stone-200" : "text-stone-900"
                          )}>
                            <Phone size={14} className="text-emerald-600" />
                            <a href={`tel:${listing.ownerPhone}`} onClick={(e) => e.stopPropagation()}>{listing.ownerPhone}</a>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="col-span-full py-20 text-center">
                    <div className={cn(
                      "w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-stone-400",
                      isDarkMode ? "bg-stone-800" : "bg-stone-100"
                    )}>
                      <Search size={32} />
                    </div>
                    <p className="text-stone-500 font-medium">{t.noListings}</p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}

        {/* Market Info Tab Content */}
        {activeTab === 'market' && (
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <TrendingUp className="text-emerald-600" />
                {t.marketInfo}
              </h2>
              <button 
                onClick={fetchMarketData}
                disabled={marketData.loading}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
                  isDarkMode ? "bg-stone-800 text-stone-200" : "bg-stone-100 text-stone-600",
                  marketData.loading && "opacity-50 cursor-not-allowed"
                )}
              >
                <RefreshCw size={16} className={cn(marketData.loading && "animate-spin")} />
                {t.updatePrices}
              </button>
            </div>

            {marketData.loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className={cn(
                    "h-48 rounded-[32px] animate-pulse",
                    isDarkMode ? "bg-stone-900" : "bg-stone-100"
                  )} />
                ))}
              </div>
            ) : (
              <>
                {/* Prices Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Tajikistan Prices */}
                  <div className={cn(
                    "p-6 rounded-[32px] border",
                    isDarkMode ? "bg-stone-900 border-stone-800" : "bg-white border-stone-200"
                  )}>
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                      <Globe size={20} className="text-emerald-600" />
                      {t.tajikistan}
                    </h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center p-3 bg-stone-50 dark:bg-stone-800 rounded-2xl">
                        <span className="font-medium">{t.meatPrices} (Beef)</span>
                        <span className="font-bold text-emerald-600">{marketData.prices?.beef_tj || '---'} TJS</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-stone-50 dark:bg-stone-800 rounded-2xl">
                        <span className="font-medium">{t.meatPrices} (Mutton)</span>
                        <span className="font-bold text-emerald-600">{marketData.prices?.mutton_tj || '---'} TJS</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-stone-50 dark:bg-stone-800 rounded-2xl">
                        <span className="font-medium">{t.feedPrices} (Wheat)</span>
                        <span className="font-bold text-emerald-600">{marketData.prices?.wheat_tj || '---'} TJS</span>
                      </div>
                    </div>
                  </div>

                  {/* Uzbekistan Prices */}
                  <div className={cn(
                    "p-6 rounded-[32px] border",
                    isDarkMode ? "bg-stone-900 border-stone-800" : "bg-white border-stone-200"
                  )}>
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                      <Globe size={20} className="text-emerald-600" />
                      {t.uzbekistan}
                    </h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center p-3 bg-stone-50 dark:bg-stone-800 rounded-2xl">
                        <span className="font-medium">{t.meatPrices} (Beef)</span>
                        <span className="font-bold text-emerald-600">{marketData.prices?.beef_uz || '---'} UZS</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-stone-50 dark:bg-stone-800 rounded-2xl">
                        <span className="font-medium">{t.meatPrices} (Mutton)</span>
                        <span className="font-bold text-emerald-600">{marketData.prices?.mutton_uz || '---'} UZS</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-stone-50 dark:bg-stone-800 rounded-2xl">
                        <span className="font-medium">{t.feedPrices} (Wheat)</span>
                        <span className="font-bold text-emerald-600">{marketData.prices?.wheat_uz || '---'} UZS</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Markets List */}
                <div className={cn(
                  "p-6 rounded-[32px] border",
                  isDarkMode ? "bg-stone-900 border-stone-800" : "bg-white border-stone-200"
                )}>
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                    <Calendar size={20} className="text-emerald-600" />
                    {t.nearbyMarkets}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {marketData.markets.map((m, i) => (
                      <a 
                        key={i}
                        href={m.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          "p-4 rounded-2xl border flex items-center justify-between group transition-all",
                          isDarkMode ? "bg-stone-800 border-stone-700 hover:border-emerald-500" : "bg-stone-50 border-stone-100 hover:border-emerald-500"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center text-emerald-600">
                            <MapPin size={20} />
                          </div>
                          <span className="font-bold text-sm line-clamp-1">{m.title}</span>
                        </div>
                        <ExternalLink size={16} className="text-stone-400 group-hover:text-emerald-600 transition-colors" />
                      </a>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {/* Floating Buttons */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4">
        <button 
          onClick={startVoiceAssistant}
          className="bg-stone-900 text-white p-5 rounded-full shadow-2xl hover:scale-110 transition-all group border-4 border-white dark:border-stone-800 relative"
        >
          <Mic size={32} className={cn("group-hover:scale-110 transition-transform", voiceStatus === 'listening' && "animate-pulse text-red-500")} />
          {voiceStatus !== 'idle' && (
            <div className="absolute -top-2 -right-2 bg-red-500 p-1.5 rounded-full">
              <Volume2 size={14} className="animate-bounce" />
            </div>
          )}
        </button>
        <button 
          onClick={startCamera}
          className="bg-stone-900 text-white p-5 rounded-full shadow-2xl hover:scale-110 transition-all group border-4 border-white dark:border-stone-800 relative"
        >
          <Camera size={32} className="group-hover:rotate-12 transition-transform" />
          <div className="absolute -top-2 -right-2 bg-emerald-500 p-1.5 rounded-full animate-pulse">
            <Sparkles size={14} />
          </div>
        </button>
      </div>

      {/* Voice Assistant Overlay */}
      <AnimatePresence>
        {isVoiceActive && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4"
          >
            <div className={cn(
              "p-6 rounded-[32px] shadow-2xl border backdrop-blur-md",
              isDarkMode ? "bg-stone-900/90 border-stone-800" : "bg-white/90 border-stone-200"
            )}>
              <div className="flex items-center gap-4 mb-4">
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center",
                  voiceStatus === 'listening' ? "bg-red-100 text-red-600 animate-pulse" : "bg-emerald-100 text-emerald-600"
                )}>
                  {voiceStatus === 'listening' ? <Mic size={24} /> : <Volume2 size={24} />}
                </div>
                <div>
                  <h3 className="font-bold text-lg">
                    {voiceStatus === 'listening' ? t.voiceListening : voiceStatus === 'processing' ? t.voiceProcessing : t.voiceAssistant}
                  </h3>
                </div>
              </div>
              <div className="space-y-3">
                {voiceText && (
                  <p className="text-sm font-medium text-stone-500 italic">"{voiceText}"</p>
                )}
                {voiceResponse && (
                  <p className="text-stone-800 dark:text-stone-100 font-bold leading-relaxed">{voiceResponse}</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Camera Modal */}
      <AnimatePresence>
        {isCameraOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-stone-950"
            />
            <div className="relative w-full max-w-lg h-full max-h-[80vh] flex flex-col">
              <div className="relative flex-1 bg-black rounded-3xl overflow-hidden shadow-2xl border border-stone-800">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  className="w-full h-full object-cover"
                />
                
                {/* Camera Controls */}
                <div className="absolute bottom-8 left-0 right-0 flex justify-center items-center gap-8">
                  <button 
                    onClick={stopCamera}
                    className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-all"
                  >
                    <X size={24} />
                  </button>
                  <button 
                    onClick={analyzeAnimal}
                    disabled={isAnalyzing}
                    className="w-20 h-20 bg-white rounded-full flex items-center justify-center text-stone-900 shadow-xl hover:scale-105 transition-all disabled:opacity-50"
                  >
                    {isAnalyzing ? <RefreshCw className="animate-spin" /> : <div className="w-16 h-16 border-4 border-stone-900 rounded-full" />}
                  </button>
                </div>

                {isAnalyzing && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center text-white">
                    <Sparkles size={48} className="animate-bounce text-emerald-400 mb-4" />
                    <p className="font-bold animate-pulse">{t.aiAnalyzing}</p>
                  </div>
                )}
              </div>

              {/* AI Result Overlay */}
              <AnimatePresence>
                {aiResult && (
                  <motion.div
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    className="absolute bottom-0 left-0 right-0 p-6 bg-white dark:bg-stone-900 rounded-t-[32px] shadow-2xl border-t border-stone-200 dark:border-stone-800"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-xl font-bold flex items-center gap-2">
                        <Sparkles className="text-emerald-500" size={20} />
                        {t.aiResult}
                      </h3>
                      <button onClick={() => setAiResult(null)} className="p-1 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full">
                        <X size={20} />
                      </button>
                    </div>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-1">{t.breed}</p>
                          <p className="text-lg font-bold text-stone-800 dark:text-stone-100">{aiResult.breed}</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-1">{t.estimatedPrice}</p>
                          <p className="text-lg font-black text-emerald-600">{aiResult.price}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-1">{t.animalInfo}</p>
                        <p className="text-stone-600 dark:text-stone-300 leading-relaxed text-sm">{aiResult.info}</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Login Modal */}
      <AnimatePresence>
        {showLoginModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLoginModal(false)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={cn(
                "relative w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden p-8",
                isDarkMode ? "bg-stone-900 text-stone-100" : "bg-white text-stone-900"
              )}
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-bold">{t.login}</h2>
                <button onClick={() => setShowLoginModal(false)} className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                {/* Google Login */}
                <button 
                  onClick={handleGoogleLogin}
                  className={cn(
                    "w-full flex items-center justify-center gap-3 px-6 py-4 border rounded-2xl font-bold transition-all",
                    isDarkMode ? "border-stone-700 hover:bg-stone-800" : "border-stone-200 hover:bg-stone-50"
                  )}
                >
                  <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                  Google
                </button>

                <div className="relative flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-stone-200 dark:border-stone-800"></div>
                  </div>
                  <span className={cn(
                    "relative px-4 text-xs font-bold uppercase tracking-widest",
                    isDarkMode ? "bg-stone-900 text-stone-500" : "bg-white text-stone-400"
                  )}>ИЛИ</span>
                </div>

                {/* Phone Login */}
                {!confirmationResult ? (
                  <form onSubmit={handleSendCode} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-stone-400">{t.enterPhone}</label>
                      <input 
                        required
                        type="tel"
                        placeholder="+998901234567"
                        value={phoneNumber}
                        onChange={e => setPhoneNumber(e.target.value)}
                        className={cn(
                          "w-full px-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all",
                          isDarkMode ? "bg-stone-800 border-stone-700" : "bg-stone-50 border-stone-200"
                        )}
                      />
                    </div>
                    <button 
                      type="submit"
                      disabled={phoneLoading}
                      className="w-full bg-stone-900 dark:bg-stone-100 dark:text-stone-900 text-white py-4 rounded-2xl font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2"
                    >
                      {phoneLoading ? <RefreshCw className="animate-spin" /> : t.sendCode}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyCode} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-stone-400">{t.enterCode}</label>
                      <input 
                        required
                        type="text"
                        placeholder="123456"
                        value={verificationCode}
                        onChange={e => setVerificationCode(e.target.value)}
                        className={cn(
                          "w-full px-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all",
                          isDarkMode ? "bg-stone-800 border-stone-700" : "bg-stone-50 border-stone-200"
                        )}
                      />
                    </div>
                    <button 
                      type="submit"
                      disabled={phoneLoading}
                      className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                    >
                      {phoneLoading ? <RefreshCw className="animate-spin" /> : t.verifyCode}
                    </button>
                  </form>
                )}
                <div id="recaptcha-container"></div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* User Profile Modal */}
      <AnimatePresence>
        {isProfileModalOpen && user && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsProfileModalOpen(false)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={cn(
                "relative w-full max-w-4xl max-h-[90vh] rounded-[32px] shadow-2xl overflow-hidden flex flex-col",
                isDarkMode ? "bg-stone-900 text-stone-100" : "bg-white text-stone-900"
              )}
            >
              <div className="p-6 border-b border-stone-200 dark:border-stone-800 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xl">
                    {userProfile?.displayName?.[0] || user.email?.[0] || 'U'}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{userProfile?.displayName || user.email}</h2>
                    <p className="text-xs text-stone-400">{userProfile?.phoneNumber || user.phoneNumber || 'No phone'}</p>
                  </div>
                </div>
                <button onClick={() => setIsProfileModalOpen(false)} className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full">
                  <X size={24} />
                </button>
              </div>

              <div className="flex border-b border-stone-200 dark:border-stone-800 overflow-x-auto">
                {(['listings', 'transactions', 'reviews', 'edit'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setProfileTab(tab)}
                    className={cn(
                      "px-6 py-4 text-sm font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap",
                      profileTab === tab 
                        ? "border-emerald-600 text-emerald-600" 
                        : "border-transparent text-stone-400 hover:text-stone-600"
                    )}
                  >
                    {tab === 'listings' ? t.listings : tab === 'transactions' ? t.transactions : tab === 'reviews' ? t.reviews : t.editProfile}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {profileTab === 'listings' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {userListings.length > 0 ? userListings.map(listing => (
                      <div key={listing.id} className="p-4 rounded-2xl border border-stone-200 dark:border-stone-800 flex gap-4">
                        <img 
                          src={`https://picsum.photos/seed/${listing.id}/100/100`} 
                          className="w-20 h-20 rounded-xl object-cover" 
                          referrerPolicy="no-referrer"
                        />
                        <div>
                          <h4 className="font-bold">{listing.title}</h4>
                          <p className="text-emerald-600 font-black">{listing.price} {listing.currency}</p>
                          <span className={cn(
                            "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase",
                            listing.status === 'active' ? "bg-emerald-100 text-emerald-600" : "bg-stone-100 text-stone-500"
                          )}>
                            {listing.status}
                          </span>
                        </div>
                      </div>
                    )) : (
                      <div className="col-span-full text-center py-12 text-stone-400">
                        {t.noListings}
                      </div>
                    )}
                  </div>
                )}

                {profileTab === 'transactions' && (
                  <div className="space-y-4">
                    {userTransactions.length > 0 ? userTransactions.map(tx => (
                      <div key={tx.id} className="p-4 rounded-2xl border border-stone-200 dark:border-stone-800 flex justify-between items-center">
                        <div>
                          <h4 className="font-bold">{tx.listingTitle}</h4>
                          <p className="text-xs text-stone-400">
                            {tx.sellerId === user.uid ? `${t.buyer}: ${tx.buyerName}` : `${t.seller}: ${tx.sellerName}`}
                          </p>
                          <p className="text-[10px] text-stone-400">{tx.createdAt.toDate().toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-emerald-600">{tx.price} {tx.currency}</p>
                          <span className="text-[10px] font-bold uppercase text-stone-400">Baraka</span>
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-12 text-stone-400">
                        No transactions yet
                      </div>
                    )}
                  </div>
                )}

                {profileTab === 'reviews' && (
                  <div className="space-y-4">
                    {userReviews.length > 0 ? userReviews.map(review => (
                      <div key={review.id} className="p-4 rounded-2xl border border-stone-200 dark:border-stone-800">
                        <div className="flex justify-between mb-2">
                          <span className="font-bold">{review.authorName}</span>
                          <RatingStars rating={review.rating} />
                        </div>
                        <p className="text-sm text-stone-600 dark:text-stone-300">{review.comment}</p>
                        <p className="text-[10px] text-stone-400 mt-2">{review.createdAt.toDate().toLocaleDateString()}</p>
                      </div>
                    )) : (
                      <div className="text-center py-12 text-stone-400">
                        No reviews yet
                      </div>
                    )}
                  </div>
                )}

                {profileTab === 'edit' && (
                  <form onSubmit={handleUpdateProfile} className="space-y-6 max-w-md mx-auto">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-stone-400">{t.displayName}</label>
                      <input 
                        required
                        value={editProfileData.displayName}
                        onChange={e => setEditProfileData({...editProfileData, displayName: e.target.value})}
                        className={cn(
                          "w-full px-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all",
                          isDarkMode ? "bg-stone-800 border-stone-700" : "bg-stone-50 border-stone-200"
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-stone-400">{t.phone}</label>
                      <input 
                        value={editProfileData.phoneNumber}
                        onChange={e => setEditProfileData({...editProfileData, phoneNumber: e.target.value})}
                        className={cn(
                          "w-full px-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all",
                          isDarkMode ? "bg-stone-800 border-stone-700" : "bg-stone-50 border-stone-200"
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-stone-400">{t.location}</label>
                      <input 
                        value={editProfileData.location}
                        onChange={e => setEditProfileData({...editProfileData, location: e.target.value})}
                        className={cn(
                          "w-full px-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all",
                          isDarkMode ? "bg-stone-800 border-stone-700" : "bg-stone-50 border-stone-200"
                        )}
                      />
                    </div>
                    <button 
                      type="submit"
                      className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all"
                    >
                      {t.saveChanges}
                    </button>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Public Profile Modal */}
      <AnimatePresence>
        {isPublicProfileOpen && publicProfileUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPublicProfileOpen(false)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={cn(
                "relative w-full max-w-2xl max-h-[80vh] rounded-[32px] shadow-2xl overflow-hidden flex flex-col",
                isDarkMode ? "bg-stone-900 text-stone-100" : "bg-white text-stone-900"
              )}
            >
              <div className="p-6 border-b border-stone-200 dark:border-stone-800 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xl">
                    {publicProfileUser.displayName?.[0] || 'U'}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{publicProfileUser.displayName}</h2>
                    {publicProfileUser.location && (
                      <p className="text-xs text-stone-400 flex items-center gap-1">
                        <MapPin size={12} />
                        {publicProfileUser.location}
                      </p>
                    )}
                  </div>
                </div>
                <button onClick={() => setIsPublicProfileOpen(false)} className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-stone-400 mb-4">{t.listings}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {publicProfileListings.length > 0 ? publicProfileListings.map(listing => (
                    <div 
                      key={listing.id} 
                      className="p-4 rounded-2xl border border-stone-200 dark:border-stone-800 flex gap-4 cursor-pointer hover:border-emerald-500 transition-colors"
                      onClick={() => {
                        setSelectedListing(listing);
                        setIsPublicProfileOpen(false);
                      }}
                    >
                      <img 
                        src={`https://picsum.photos/seed/${listing.id}/100/100`} 
                        className="w-20 h-20 rounded-xl object-cover" 
                        referrerPolicy="no-referrer"
                      />
                      <div>
                        <h4 className="font-bold line-clamp-1">{listing.title}</h4>
                        <p className="text-emerald-600 font-black">{listing.price.toLocaleString()} {listing.currency}</p>
                        <p className="text-[10px] text-stone-400 flex items-center gap-1 mt-1">
                          <MapPin size={10} />
                          {listing.location}
                        </p>
                      </div>
                    </div>
                  )) : (
                    <div className="col-span-full text-center py-12 text-stone-400 italic">
                      {t.noListings}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal for New Listing */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={cn(
                "relative w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden",
                isDarkMode ? "bg-stone-900 text-stone-100" : "bg-white text-stone-900"
              )}
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold">{t.createListing}</h2>
                  <button onClick={() => setIsModalOpen(false)} className={cn(
                    "p-2 rounded-full transition-colors",
                    isDarkMode ? "hover:bg-stone-800" : "hover:bg-stone-100"
                  )}>
                    <X size={24} />
                  </button>
                </div>

                <form onSubmit={handleSubmitListing} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-stone-400">{t.title}</label>
                      <input 
                        required
                        value={newListing.title}
                        onChange={e => setNewListing({...newListing, title: e.target.value})}
                        className={cn(
                          "w-full px-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all",
                          isDarkMode ? "bg-stone-800 border-stone-700" : "bg-stone-50 border-stone-200"
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-stone-400">{t.breed}</label>
                      <input 
                        value={newListing.breed}
                        onChange={e => setNewListing({...newListing, breed: e.target.value})}
                        placeholder="например: Голштинская"
                        className={cn(
                          "w-full px-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all",
                          isDarkMode ? "bg-stone-800 border-stone-700" : "bg-stone-50 border-stone-200"
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-stone-400">{t.selectCategory}</label>
                      <select 
                        value={newListing.category}
                        onChange={e => setNewListing({...newListing, category: e.target.value})}
                        className={cn(
                          "w-full px-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all",
                          isDarkMode ? "bg-stone-800 border-stone-700" : "bg-stone-50 border-stone-200"
                        )}
                      >
                        {Object.entries(t.categoriesList).map(([key, value]) => (
                          <option key={key} value={key}>{value}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-stone-400">{t.description}</label>
                    <textarea 
                      required
                      rows={3}
                      value={newListing.description}
                      onChange={e => setNewListing({...newListing, description: e.target.value})}
                      className={cn(
                        "w-full px-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none",
                        isDarkMode ? "bg-stone-800 border-stone-700" : "bg-stone-50 border-stone-200"
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-stone-400">{t.price}</label>
                      <input 
                        required
                        type="number"
                        value={newListing.price}
                        onChange={e => setNewListing({...newListing, price: e.target.value})}
                        className={cn(
                          "w-full px-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all",
                          isDarkMode ? "bg-stone-800 border-stone-700" : "bg-stone-50 border-stone-200"
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-stone-400">{t.currency}</label>
                      <select 
                        value={newListing.currency}
                        onChange={e => setNewListing({...newListing, currency: e.target.value})}
                        className={cn(
                          "w-full px-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all",
                          isDarkMode ? "bg-stone-800 border-stone-700" : "bg-stone-50 border-stone-200"
                        )}
                      >
                        <option value="TJS">TJS (Tajikistan)</option>
                        <option value="UZS">UZS (Uzbekistan)</option>
                        <option value="USD">USD</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-stone-400">{t.country}</label>
                      <select 
                        value={newListing.country}
                        onChange={e => setNewListing({...newListing, country: e.target.value as any})}
                        className={cn(
                          "w-full px-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all",
                          isDarkMode ? "bg-stone-800 border-stone-700" : "bg-stone-50 border-stone-200"
                        )}
                      >
                        <option value="Tajikistan">{t.tajikistan}</option>
                        <option value="Uzbekistan">{t.uzbekistan}</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-stone-400">{t.location}</label>
                      <input 
                        required
                        value={newListing.location}
                        onChange={e => setNewListing({...newListing, location: e.target.value})}
                        className={cn(
                          "w-full px-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all",
                          isDarkMode ? "bg-stone-800 border-stone-700" : "bg-stone-50 border-stone-200"
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-stone-400">{t.phone}</label>
                      <input 
                        required
                        type="tel"
                        placeholder="+998 / +992 ..."
                        value={newListing.phone}
                        onChange={e => setNewListing({...newListing, phone: e.target.value})}
                        className={cn(
                          "w-full px-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all",
                          isDarkMode ? "bg-stone-800 border-stone-700" : "bg-stone-50 border-stone-200"
                        )}
                      />
                    </div>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button 
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className={cn(
                        "flex-1 px-6 py-4 border rounded-2xl font-bold transition-all",
                        isDarkMode ? "border-stone-700 hover:bg-stone-800" : "border-stone-200 hover:bg-stone-50"
                      )}
                    >
                      {t.cancel}
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                    >
                      {t.submit}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal for Listing Details & Comments */}
      <AnimatePresence>
        {selectedListing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedListing(null)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={cn(
                "relative w-full max-w-4xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]",
                isDarkMode ? "bg-stone-900 text-stone-100" : "bg-white text-stone-900"
              )}
            >
              <div className={cn(
                "w-full md:w-1/2 relative",
                isDarkMode ? "bg-stone-800" : "bg-stone-100"
              )}>
                <img 
                  src={`https://picsum.photos/seed/${selectedListing.id}/800/600`} 
                  alt={selectedListing.title}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <button 
                  onClick={() => setSelectedListing(null)} 
                  className="absolute top-4 left-4 p-2 bg-white/80 backdrop-blur-md rounded-full hover:bg-white transition-colors md:hidden text-stone-900"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="w-full md:w-1/2 flex flex-col h-full overflow-hidden">
                <div className={cn(
                  "p-6 border-b flex justify-between items-start",
                  isDarkMode ? "border-stone-800" : "border-stone-100"
                )}>
                  <div>
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider mb-2 inline-block",
                      selectedListing.type === 'sale' ? "bg-emerald-500 text-white" : "bg-blue-500 text-white"
                    )}>
                      {selectedListing.type === 'sale' ? t.sale : t.purchase}
                    </span>
                    <h2 className="text-2xl font-bold">{selectedListing.title}</h2>
                    <div className="flex items-center gap-2 mt-1 mb-2">
                      <RatingStars rating={4.8} count={24} />
                      <span className="text-xs font-bold text-stone-400">{t.barakatRating}</span>
                    </div>
                    <p className="text-emerald-600 dark:text-emerald-400 font-bold text-2xl">
                      {selectedListing.price.toLocaleString()} {selectedListing.currency}
                    </p>
                  </div>
                  <button 
                    onClick={() => setSelectedListing(null)} 
                    className={cn(
                      "p-2 rounded-full transition-colors hidden md:block",
                      isDarkMode ? "hover:bg-stone-800" : "hover:bg-stone-100"
                    )}
                  >
                    <X size={24} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">{t.description}</h3>
                    <p className={cn(
                      "leading-relaxed whitespace-pre-wrap",
                      isDarkMode ? "text-stone-300" : "text-stone-600"
                    )}>{selectedListing.description}</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {selectedListing.breed && (
                      <div className={cn(
                        "p-3 rounded-2xl",
                        isDarkMode ? "bg-stone-800" : "bg-stone-50"
                      )}>
                        <p className="text-[10px] font-bold uppercase text-stone-400 mb-1">{t.breed}</p>
                        <p className="text-sm font-medium flex items-center gap-1">
                          <Tag size={14} className="text-emerald-600" />
                          {selectedListing.breed}
                        </p>
                      </div>
                    )}
                    <div className={cn(
                      "p-3 rounded-2xl",
                      isDarkMode ? "bg-stone-800" : "bg-stone-50"
                    )}>
                      <p className="text-[10px] font-bold uppercase text-stone-400 mb-1">{t.location}</p>
                      <p className="text-sm font-medium flex items-center gap-1">
                        <MapPin size={14} className="text-emerald-600" />
                        {selectedListing.location}
                      </p>
                    </div>
                    <div className={cn(
                      "p-3 rounded-2xl",
                      isDarkMode ? "bg-stone-800" : "bg-stone-50"
                    )}>
                      <p className="text-[10px] font-bold uppercase text-stone-400 mb-1">{t.phone}</p>
                      <p className="text-sm font-medium flex items-center gap-1">
                        <Phone size={14} className="text-emerald-600" />
                        <a href={`tel:${selectedListing.ownerPhone}`}>{selectedListing.ownerPhone}</a>
                      </p>
                    </div>
                    <div className={cn(
                      "p-3 rounded-2xl",
                      isDarkMode ? "bg-stone-800" : "bg-stone-50"
                    )}>
                      <p className="text-[10px] font-bold uppercase text-stone-400 mb-1">{t.seller}</p>
                      <button 
                        onClick={() => openPublicProfile(selectedListing.ownerId)}
                        className="text-sm font-medium flex items-center gap-1 hover:text-emerald-600 transition-colors text-left"
                      >
                        <UserIcon size={14} className="text-emerald-600" />
                        {selectedListing.ownerName}
                      </button>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    {user?.uid === selectedListing.ownerId ? (
                      selectedListing.status === 'active' && (
                        <button 
                          onClick={() => {
                            setBarakaListing(selectedListing);
                            setIsBarakaModalOpen(true);
                          }}
                          className="flex-1 bg-orange-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-orange-700 transition-all shadow-lg shadow-orange-100"
                        >
                          <CheckCircle2 size={20} />
                          {t.markAsSold}
                        </button>
                      )
                    ) : (
                      <>
                        <button 
                          onClick={() => startChat(selectedListing)}
                          className="flex-1 bg-emerald-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                        >
                          <MessageSquare size={20} />
                          {t.contactSeller}
                        </button>
                        <button 
                          onClick={() => user ? setIsBargainModalOpen(true) : setShowLoginModal(true)}
                          className="flex-1 bg-stone-900 dark:bg-stone-100 dark:text-stone-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-lg shadow-stone-200"
                        >
                          <TrendingUp size={20} />
                          {t.bargain}
                        </button>
                      </>
                    )}
                  </div>

                  {/* Review Section */}
                  {selectedListing.status === 'baraka' && selectedTransaction && user?.uid === selectedTransaction.buyerId && (
                    <div className={cn(
                      "p-6 rounded-3xl border",
                      isDarkMode ? "bg-stone-800 border-stone-700" : "bg-emerald-50 border-emerald-100"
                    )}>
                      {hasReviewed ? (
                        <div className="text-center py-4">
                          <CheckCircle2 className="mx-auto text-emerald-600 mb-2" size={32} />
                          <p className="font-bold text-emerald-600">{t.thankYouReview}</p>
                        </div>
                      ) : (
                        <form onSubmit={handleReviewSubmit} className="space-y-4">
                          <h3 className="font-bold flex items-center gap-2">
                            <Star className="text-orange-500" size={20} />
                            {t.leaveReview}
                          </h3>
                          <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => setReviewRating(star)}
                                className="transition-transform hover:scale-110"
                              >
                                <Star 
                                  size={24} 
                                  className={cn(
                                    star <= reviewRating ? "fill-orange-500 text-orange-500" : "text-stone-300"
                                  )} 
                                />
                              </button>
                            ))}
                          </div>
                          <textarea
                            required
                            value={reviewComment}
                            onChange={(e) => setReviewComment(e.target.value)}
                            placeholder={t.reviewPlaceholder}
                            className={cn(
                              "w-full px-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none text-sm",
                              isDarkMode ? "bg-stone-900 border-stone-700" : "bg-white border-stone-200"
                            )}
                            rows={3}
                          />
                          <button
                            type="submit"
                            disabled={isSubmittingReview}
                            className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all disabled:opacity-50"
                          >
                            {isSubmittingReview ? t.loading : t.send}
                          </button>
                        </form>
                      )}
                    </div>
                  )}

                  {/* Comments Section */}
                  <div className={cn(
                    "pt-6 border-t",
                    isDarkMode ? "border-stone-800" : "border-stone-100"
                  )}>
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                      {t.comments}
                      <span className={cn(
                        "text-sm font-normal px-2 py-0.5 rounded-full",
                        isDarkMode ? "text-stone-400 bg-stone-800" : "text-stone-400 bg-stone-100"
                      )}>
                        {comments.length}
                      </span>
                    </h3>

                    <div className="space-y-4 mb-6">
                      {comments.map((comment) => (
                        <div key={comment.id} className="flex gap-3">
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-stone-400 flex-shrink-0",
                            isDarkMode ? "bg-stone-800" : "bg-stone-100"
                          )}>
                            <UserIcon size={16} />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-sm">{comment.authorName}</span>
                              <span className="text-[10px] text-stone-400">
                                {comment.createdAt?.toDate().toLocaleDateString()}
                              </span>
                            </div>
                            <p className={cn(
                              "text-sm p-3 rounded-2xl rounded-tl-none",
                              isDarkMode ? "text-stone-300 bg-stone-800" : "text-stone-600 bg-stone-50"
                            )}>
                              {comment.text}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {user ? (
                      <form onSubmit={handleSubmitComment} className="flex gap-2">
                        <input 
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          placeholder={t.writeComment}
                          className={cn(
                            "flex-1 px-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all",
                            isDarkMode ? "bg-stone-800 border-stone-700 text-stone-100" : "bg-stone-50 border-stone-200 text-stone-900"
                          )}
                        />
                        <button 
                          type="submit"
                          className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all"
                        >
                          {t.send}
                        </button>
                      </form>
                    ) : (
                      <div className={cn(
                        "p-4 rounded-2xl text-center",
                        isDarkMode ? "bg-stone-800" : "bg-stone-50"
                      )}>
                        <p className="text-sm text-stone-500 mb-2">Войдите, чтобы оставить отзыв</p>
                        <button onClick={handleLogin} className="text-emerald-600 font-bold text-sm hover:underline">
                          {t.login}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Baraka Modal */}
      <AnimatePresence>
        {isBarakaModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBarakaModalOpen(false)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={cn(
                "relative w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden p-8",
                isDarkMode ? "bg-stone-900 text-stone-100" : "bg-white text-stone-900"
              )}
            >
              <h2 className="text-2xl font-bold mb-6">{t.markAsSold}</h2>
              <form onSubmit={handleMarkAsSold} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-stone-400">{t.finalPrice}</label>
                  <input 
                    required
                    type="number"
                    value={barakaPrice}
                    onChange={e => setBarakaPrice(e.target.value)}
                    className={cn(
                      "w-full px-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all",
                      isDarkMode ? "bg-stone-800 border-stone-700" : "bg-stone-50 border-stone-200"
                    )}
                  />
                </div>
                <div className="flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsBarakaModalOpen(false)}
                    className="flex-1 py-4 border border-stone-200 dark:border-stone-800 rounded-2xl font-bold"
                  >
                    {t.cancel}
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-orange-600 text-white rounded-2xl font-bold"
                  >
                    {t.submit}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bargain Modal */}
      <AnimatePresence>
        {isBargainModalOpen && selectedListing && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBargainModalOpen(false)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={cn(
                "relative w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden p-8",
                isDarkMode ? "bg-stone-900 text-stone-100" : "bg-white text-stone-900"
              )}
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">{t.bargain}</h2>
                <button onClick={() => setIsBargainModalOpen(false)} className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full">
                  <X size={24} />
                </button>
              </div>
              
              <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-100 dark:border-emerald-800">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-1">{t.price}</p>
                <p className="text-xl font-black">{selectedListing.price.toLocaleString()} {selectedListing.currency}</p>
              </div>

              <form onSubmit={handleSendBargain} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-stone-400">{t.yourOffer}</label>
                  <div className="relative">
                    <input 
                      required
                      type="number"
                      value={bargainPrice}
                      onChange={e => setBargainPrice(e.target.value)}
                      placeholder={selectedListing.price.toString()}
                      className={cn(
                        "w-full px-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-bold text-lg",
                        isDarkMode ? "bg-stone-800 border-stone-700" : "bg-stone-50 border-stone-200"
                      )}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-stone-400">
                      {selectedListing.currency}
                    </span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsBargainModalOpen(false)}
                    className="flex-1 py-4 border border-stone-200 dark:border-stone-800 rounded-2xl font-bold hover:bg-stone-50 dark:hover:bg-stone-800 transition-all"
                  >
                    {t.cancel}
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                  >
                    {t.sendOffer}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Chat List Modal */}
      <AnimatePresence>
        {isChatListOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsChatListOpen(false)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 100 }}
              className={cn(
                "relative w-full max-w-md h-[80vh] rounded-[32px] shadow-2xl overflow-hidden flex flex-col",
                isDarkMode ? "bg-stone-900 text-stone-100" : "bg-white text-stone-900"
              )}
            >
              <div className="p-6 border-b border-stone-200 dark:border-stone-800 flex justify-between items-center">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <MessageSquare className="text-emerald-600" />
                  {t.messages}
                </h2>
                <button onClick={() => setIsChatListOpen(false)} className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full">
                  <X size={24} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {chats.length > 0 ? chats.map(chat => (
                  <button
                    key={chat.id}
                    onClick={() => {
                      setActiveChat(chat);
                      setIsChatOpen(true);
                    }}
                    className={cn(
                      "w-full p-4 rounded-2xl text-left transition-all flex items-center gap-4",
                      isDarkMode ? "hover:bg-stone-800" : "hover:bg-stone-50"
                    )}
                  >
                    <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold">
                      {Object.values(chat.participantNames).find(name => name !== user?.displayName)?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <span className="font-bold truncate">
                          {Object.values(chat.participantNames).find(name => name !== user?.displayName)}
                        </span>
                        <span className="text-[10px] text-stone-400">
                          {chat.updatedAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-stone-500 truncate">{chat.listingTitle}</p>
                    </div>
                  </button>
                )) : (
                  <div className="h-full flex flex-col items-center justify-center text-stone-400">
                    <MessageSquare size={48} className="mb-4 opacity-20" />
                    <p>{t.noListings}</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Chat Window Modal */}
      <AnimatePresence>
        {isChatOpen && activeChat && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsChatOpen(false)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className={cn(
                "relative w-full max-w-lg h-[80vh] rounded-[32px] shadow-2xl overflow-hidden flex flex-col",
                isDarkMode ? "bg-stone-900 text-stone-100" : "bg-white text-stone-900"
              )}
            >
              <div className="p-4 border-b border-stone-200 dark:border-stone-800 flex justify-between items-center bg-emerald-600 text-white">
                <div className="flex items-center gap-3">
                  <button onClick={() => setIsChatOpen(false)} className="p-1 hover:bg-white/20 rounded-full">
                    <X size={20} />
                  </button>
                  <div>
                    <h2 className="font-bold leading-tight">
                      {Object.values(activeChat.participantNames).find(name => name !== user?.displayName)}
                    </h2>
                    <p className="text-[10px] opacity-80">{activeChat.listingTitle}</p>
                  </div>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col">
                {messages.map((msg, idx) => {
                  const isMe = msg.senderId === user?.uid;
                  return (
                    <div 
                      key={msg.id || idx} 
                      className={cn(
                        "max-w-[80%] p-3 rounded-2xl text-sm shadow-sm",
                        isMe 
                          ? "bg-emerald-600 text-white self-end rounded-tr-none" 
                          : (isDarkMode ? "bg-stone-800 text-stone-100 self-start rounded-tl-none" : "bg-stone-100 text-stone-900 self-start rounded-tl-none")
                      )}
                    >
                      <p>{msg.text}</p>
                      <span className={cn(
                        "text-[8px] mt-1 block text-right opacity-60",
                        isMe ? "text-white" : "text-stone-400"
                      )}>
                        {msg.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })}
              </div>

              <form onSubmit={sendMessage} className="p-4 border-t border-stone-200 dark:border-stone-800 flex gap-2">
                <input 
                  value={chatMessage}
                  onChange={e => setChatMessage(e.target.value)}
                  placeholder={t.typeMessage}
                  className={cn(
                    "flex-1 px-4 py-3 border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all",
                    isDarkMode ? "bg-stone-800 border-stone-700" : "bg-stone-50 border-stone-200"
                  )}
                />
                <button 
                  type="submit"
                  className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center hover:bg-emerald-700 transition-all"
                >
                  <Send size={20} />
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
