
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronsRight, LogOut, Trophy } from 'lucide-react';

import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, type User as FirebaseUser } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, collection, getCountFromServer, query, orderBy, limit, onSnapshot, updateDoc, arrayUnion } from "firebase/firestore";
import { app } from '@/lib/firebase';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";


// Schema for the auth form
const authSchema = z.object({
  firstName: z.string().optional(),
  email: z.string().email({ message: "Please enter a valid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
  emailMarketingOptIn: z.boolean().optional(),
});
type AuthFormValues = z.infer<typeof authSchema>;

type UserProfile = {
  firstName: string;
  email: string;
  bestScore: number;
  scores: number[];
  emailMarketingOptIn: boolean;
};

type HighScore = { score: number; name: string };

const GAME_DURATION = 30; // seconds
const BONUS_ICON_TIMEOUT = 1000; // ms
const BONUS_POINTS = 5;

export default function PrimalTapChallengePage() {
  const [gameState, setGameState] = useState<'auth' | 'idle' | 'playing' | 'gameOver'>('auth');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [iconPosition, setIconPosition] = useState({ top: 50, left: 50, visible: false });
  const [bonusIcon, setBonusIcon] = useState({ top: 50, left: 50, visible: false, key: 0 });
  const [iconTimeoutDuration, setIconTimeoutDuration] = useState(800);
  const [spawnInterval, setSpawnInterval] = useState(600);
  
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [competitors, setCompetitors] = useState(0);
  const [highScore, setHighScore] = useState<HighScore | null>(null);
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(true);

  const { toast } = useToast();

  const auth = getAuth(app);
  const db = getFirestore(app);

  const iconTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const gameLoopTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const gameAreaRef = useRef<HTMLDivElement>(null);
  const bonusScheduleTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const bonusIconTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const form = useForm<AuthFormValues>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      firstName: '',
      email: '',
      password: '',
      emailMarketingOptIn: false,
    },
    mode: 'onChange',
  });

  // Set game speed based on device
  useEffect(() => {
    const isMobileDevice = /Mobi|Android/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
    if (isMobileDevice) {
      setIconTimeoutDuration(1000);
      setSpawnInterval(1000);
    } else {
      setIconTimeoutDuration(600);
      setSpawnInterval(600);
    }
  }, []);

  // Auth state listener
  useEffect(() => {
    setLoading(true);
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          setCurrentUser(user);
          setUserProfile(userDocSnap.data() as UserProfile);
          setGameState('idle');
        } else {
          console.error("User authenticated but no profile document found. Signing out.");
          toast({
            variant: "destructive",
            title: "Account Error",
            description: "Your user profile is missing. Please sign up again.",
          });
          await signOut(auth);
        }
      } else {
        setCurrentUser(null);
        setUserProfile(null);
        setGameState('auth');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [auth, db, toast]);

  // Data listeners for competitors and high score
  useEffect(() => {
    const usersCollection = collection(db, "users");

    getCountFromServer(usersCollection).then(snapshot => {
      setCompetitors(snapshot.data().count);
    }).catch(error => {
      console.error("Failed to get competitor count:", error);
      toast({
        variant: "destructive",
        title: "Database Error",
        description: "Could not load competitor count. Your Firestore security rules may be too restrictive.",
      });
    });

    const highScoreQuery = query(usersCollection, orderBy("bestScore", "desc"), limit(1));
    const unsubscribeHighScore = onSnapshot(highScoreQuery, 
      (querySnapshot) => {
        if (!querySnapshot.empty) {
          const topPlayer = querySnapshot.docs[0].data() as UserProfile;
          if (topPlayer.bestScore > 0) {
            setHighScore({ score: topPlayer.bestScore, name: topPlayer.firstName });
          } else {
            setHighScore(null);
          }
        } else {
          setHighScore(null);
        }
      },
      (error) => {
        console.error("High score listener error:", error);
        toast({
          variant: "destructive",
          title: "Database Error",
          description: "Could not load high score. Your Firestore security rules may be too restrictive.",
        });
        setHighScore(null);
      }
    );

    return () => unsubscribeHighScore();
  }, [db, toast]);


  const stopGame = useCallback(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (iconTimeoutRef.current) clearTimeout(iconTimeoutRef.current);
    if (gameLoopTimeoutRef.current) clearTimeout(gameLoopTimeoutRef.current);
    if (bonusIconTimeoutRef.current) clearTimeout(bonusIconTimeoutRef.current);
    bonusScheduleTimeoutsRef.current.forEach(clearTimeout);
    bonusScheduleTimeoutsRef.current = [];

    setIconPosition(p => ({ ...p, visible: false }));
    setBonusIcon(b => ({ ...b, visible: false }));
  }, []);

  const showNextIcon = useCallback(() => {
    if (gameLoopTimeoutRef.current) clearTimeout(gameLoopTimeoutRef.current);
    
    gameLoopTimeoutRef.current = setTimeout(() => {
      if (gameAreaRef.current) {
        const gameArea = gameAreaRef.current.getBoundingClientRect();
        const top = Math.random() * (gameArea.height - 80);
        const left = Math.random() * (gameArea.width - 80);
        setIconPosition({ top, left, visible: true });

        if (iconTimeoutRef.current) clearTimeout(iconTimeoutRef.current);
        iconTimeoutRef.current = setTimeout(() => {
          setIconPosition(p => ({ ...p, visible: false }));
          showNextIcon();
        }, iconTimeoutDuration);
      }
    }, spawnInterval);
  }, [iconTimeoutDuration, spawnInterval]);

  const showBonusIcon = useCallback(() => {
    if (gameAreaRef.current) {
      const gameArea = gameAreaRef.current.getBoundingClientRect();
      const top = Math.random() * (gameArea.height - 100);
      const left = Math.random() * (gameArea.width - 100);
      
      setBonusIcon({ top, left, visible: true, key: Date.now() });

      if (bonusIconTimeoutRef.current) clearTimeout(bonusIconTimeoutRef.current);
      bonusIconTimeoutRef.current = setTimeout(() => {
        setBonusIcon(b => ({ ...b, visible: false }));
      }, BONUS_ICON_TIMEOUT);
    }
  }, []);
  
  const scheduleBonusIcons = useCallback(() => {
    bonusScheduleTimeoutsRef.current.forEach(clearTimeout);
    bonusScheduleTimeoutsRef.current = [];

    const schedule = (delay: number, variance: number) => {
        const timeoutId = setTimeout(showBonusIcon, delay + Math.random() * variance);
        bonusScheduleTimeoutsRef.current.push(timeoutId);
    };

    schedule(5000, 2000);  // ~5-7 seconds
    schedule(11000, 2000); // ~11-13 seconds
    schedule(18000, 2000); // ~18-20 seconds
    schedule(25000, 2000); // ~25-27 seconds
  }, [showBonusIcon]);
  
  useEffect(() => {
    if (gameState === 'playing') {
      setTimeLeft(GAME_DURATION);
      setScore(0);
      showNextIcon();
      scheduleBonusIcons();
      
      timerIntervalRef.current = setInterval(() => {
        setTimeLeft(prevTime => {
          if (prevTime <= 1) {
            setGameState('gameOver');
            return 0;
          }
          return prevTime - 1;
        });
      }, 1000);
    } else {
      stopGame();
    }
    return () => stopGame();
  }, [gameState, showNextIcon, stopGame, scheduleBonusIcons]);

  useEffect(() => {
    if (gameState === 'gameOver' && currentUser && userProfile) {
      const saveScore = async () => {
          const userDocRef = doc(db, 'users', currentUser.uid);
          
          await updateDoc(userDocRef, {
              scores: arrayUnion(score)
          });

          if (score > userProfile.bestScore) {
              await updateDoc(userDocRef, {
                  bestScore: score
              });
              setUserProfile(p => p ? { ...p, bestScore: score } : null);
              toast({
                  title: "🏆 New Personal Best!",
                  description: `Congratulations, ${userProfile.firstName}! You've set a new personal record!`,
              });
          }
      }
      saveScore().catch(error => {
          console.error("Error saving score: ", error);
          toast({ variant: "destructive", title: "Error", description: "Could not save your score." });
      });
    }
  }, [gameState, score, currentUser, userProfile, db, toast]);


  const handleIconClick = useCallback(() => {
    if (!iconPosition.visible || gameState !== 'playing') return;
    setScore(prevScore => prevScore + 1);
    if (iconTimeoutRef.current) clearTimeout(iconTimeoutRef.current);
    setIconPosition(p => ({ ...p, visible: false }));
    if (gameLoopTimeoutRef.current) clearTimeout(gameLoopTimeoutRef.current);
    showNextIcon();
  }, [gameState, iconPosition.visible, showNextIcon]);

  const handleBonusIconClick = useCallback(() => {
    if (!bonusIcon.visible || gameState !== 'playing') return;
    setScore(prevScore => prevScore + BONUS_POINTS);
    if (bonusIconTimeoutRef.current) clearTimeout(bonusIconTimeoutRef.current);
    setBonusIcon(b => ({ ...b, visible: false }));
  }, [gameState, bonusIcon.visible]);
  
  const handlePlayAgain = useCallback(() => setGameState('playing'), []);
  
  const handleLogout = useCallback(async () => {
    await signOut(auth);
    form.reset();
  }, [auth, form]);

  const onAuthSubmit: SubmitHandler<AuthFormValues> = async (data) => {
    if (isLogin) {
      try {
        await signInWithEmailAndPassword(auth, data.email, data.password);
      } catch (error: any) {
        console.error("Login failed:", error);
        toast({ variant: "destructive", title: "Login Failed", description: error?.message || "Invalid email or password." });
      }
    } else {
      if (!data.firstName) {
        form.setError("firstName", { type: "manual", message: "First name is required." });
        return;
      }
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
        const newUser = userCredential.user;
        const newUserProfile: UserProfile = {
          firstName: data.firstName,
          email: data.email,
          scores: [],
          bestScore: 0,
          emailMarketingOptIn: !!data.emailMarketingOptIn,
        };
        await setDoc(doc(db, "users", newUser.uid), newUserProfile);
        setCompetitors(c => c + 1);
      } catch (error: any) {
        console.error("Signup failed:", error);
        if (error instanceof Error && (error as any).code === 'auth/email-already-in-use') {
          toast({
            variant: "destructive",
            title: "Signup Failed",
            description: "An account with this email already exists.",
          });
        } else {
          toast({
            variant: "destructive",
            title: "Signup Failed",
            description: "An unexpected error occurred. Please try again.",
          });
        }
      }
    }
  };

  const renderGameContent = () => {
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center">
                <Skeleton className="w-[150px] h-[150px] rounded-full mb-4" />
                <Skeleton className="h-8 w-48 mb-2" />
                <Skeleton className="h-6 w-32" />
            </div>
        )
    }

    switch (gameState) {
      case 'auth':
        return (
             <div className="flex flex-col items-center justify-center h-full text-center">
                 <Image src="/PC-Elements-15.png" alt="Primal Tap Challenge Logo" width={150} height={150} className="mx-auto mb-4" data-ai-hint="logo emblem" />
                <CardTitle className="text-2xl md:text-3xl font-headline text-primary mb-2">{isLogin ? 'Welcome Back' : 'Create Account'}</CardTitle>
                <CardDescription className="mb-6 text-foreground/80">{isLogin ? 'Log in to continue.' : 'Join the challenge!'}</CardDescription>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onAuthSubmit)} className="space-y-4 w-full max-w-sm mx-auto">
                        {!isLogin && (
                           <FormField
                            control={form.control}
                            name="firstName"
                            rules={{ required: !isLogin && 'First name is required for sign up.' }}
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel className="sr-only">First Name</FormLabel>
                                <FormControl>
                                    <Input placeholder="First Name" {...field} className="text-center bg-background/50 border-primary/20"/>
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                            />
                        )}
                        <FormField control={form.control} name="email" render={({ field }) => (
                            <FormItem>
                                <FormLabel className="sr-only">Email</FormLabel>
                                <FormControl><Input placeholder="Email" {...field} className="text-center bg-background/50 border-primary/20"/></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}/>
                        <FormField control={form.control} name="password" render={({ field }) => (
                            <FormItem>
                                <FormLabel className="sr-only">Password</FormLabel>
                                <FormControl><Input type="password" placeholder="Password" {...field} className="text-center bg-background/50 border-primary/20"/></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}/>
                        {!isLogin && (
                          <FormField
                            control={form.control}
                            name="emailMarketingOptIn"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm bg-background/50 border-primary/20">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none text-left">
                                  <FormLabel>
                                    Keep me in the loop with deals and updates via email.
                                  </FormLabel>
                                  <FormDescription>
                                    We respect your privacy. Your email will only be used for communication you’ve opted into.
                                  </FormDescription>
                                </div>
                              </FormItem>
                            )}
                          />
                        )}
                        <Button type="submit" className="w-full font-bold" size="lg" disabled={form.formState.isSubmitting}>
                            {form.formState.isSubmitting ? 'Processing...' : isLogin ? 'Log In' : 'Sign Up'}
                        </Button>
                    </form>
                </Form>
                <Button variant="link" onClick={() => setIsLogin(!isLogin)} className="mt-4 text-primary">
                    {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Log In"}
                </Button>
            </div>
        )
      case 'playing':
        return (
          <>
            <CardHeader className="flex-row items-center justify-between text-primary font-bold font-headline border-b border-primary/10">
                <span className="text-2xl md:text-3xl">Time: {timeLeft}s</span>
                <span className="text-2xl md:text-3xl">Score: {score}</span>
            </CardHeader>
            <div className="relative w-full bg-accent/20 rounded-lg overflow-hidden flex-grow" ref={gameAreaRef}>
              {iconPosition.visible && (
                  <button
                    className="absolute transition-opacity duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-primary rounded-full"
                    style={{ top: `${iconPosition.top}px`, left: `${iconPosition.left}px` }}
                    onClick={handleIconClick}
                    aria-label="Tap target"
                  >
                    <Image src="/PC-Elements-15.png" alt="Primal Cuts target" width={80} height={80} className="animate-pulse hover:scale-110 transition-transform" />
                  </button>
                )}
                {bonusIcon.visible && (
                  <button
                    key={bonusIcon.key}
                    className="absolute focus:outline-none focus:ring-2 focus:ring-yellow-400 rounded-full animate-in fade-in-50 scale-95 hover:scale-105 transition-transform"
                    style={{ top: `${bonusIcon.top}px`, left: `${bonusIcon.left}px` }}
                    onClick={handleBonusIconClick}
                    aria-label="Bonus tap target"
                  >
                    <Image src="/bull.png" alt="Bonus target" width={100} height={100} />
                  </button>
                )}
            </div>
          </>
        );
      case 'gameOver':
        return (
          <div className="text-center py-6 flex flex-col justify-center items-center h-full">
            <h2 className="text-2xl font-bold font-headline text-primary mb-2">Time's Up!</h2>
            <p className="text-6xl font-bold font-headline text-accent-foreground mb-4">{score}</p>
            <p className="text-lg text-foreground/80 mb-6">Your final score</p>
            <Carousel className="w-full max-w-xs mx-auto my-6">
              <CarouselContent>
                <CarouselItem>
                  <div className="p-1 flex justify-center">
                    <Image src="/biltong-1.png" alt="Biltong product shot 1" width={200} height={200} className="rounded-lg" />
                  </div>
                </CarouselItem>
                <CarouselItem>
                  <div className="p-1 flex justify-center">
                    <Image src="/biltong-2.png" alt="Biltong product shot 2" width={200} height={200} className="rounded-lg" />
                  </div>
                </CarouselItem>
                <CarouselItem>
                  <div className="p-1 flex justify-center">
                    <Image src="/biltong-3.png" alt="Biltong product shot 3" width={200} height={200} className="rounded-lg" />
                  </div>
                </CarouselItem>
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
            <div className="flex flex-col sm:flex-row gap-4 mt-8">
                <Link href="https://primalcutsusa.com/collections/all" passHref target="_blank" rel="noopener noreferrer">
                    <Button>Shop Our Biltong</Button>
                </Link>
                <Button variant="outline" onClick={handlePlayAgain}>Play Again</Button>
                <Link href="/leaderboard" passHref>
                    <Button variant="outline">View Leaderboard</Button>
                </Link>
            </div>
          </div>
        );
      case 'idle':
      default:
        return (
          <div className="text-center py-10 flex flex-col justify-center items-center h-full gap-8">
            <div className='flex flex-col items-center justify-center gap-4'>
              <Image src="/PC-Elements-15.png" alt="Primal Tap Challenge Logo" width={300} height={300} className="mx-auto" data-ai-hint="logo emblem" />
              <div className='text-center'>
                 <CardTitle className="text-2xl md:text-3xl font-headline text-primary">Primal Tap Challenge</CardTitle>
                <CardDescription className="mt-4 text-lg text-foreground/80 max-w-md mx-auto">
                  Tap as many horns in 30 seconds, Watch out for the WHITE bull, get 5 bonus points when you catch the bull!
                </CardDescription>
              </div>
            </div>
            
            <div className="space-y-4 w-full px-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-center">
                    <div className="bg-background/50 p-4 rounded-lg">
                        <p className="text-sm text-muted-foreground">Competitors</p>
                        <p className="text-2xl font-bold text-primary">{competitors}</p>
                    </div>
                     <div className="bg-background/50 p-4 rounded-lg">
                        <p className="text-sm text-muted-foreground">High Score</p>
                        <p className="text-2xl font-bold text-primary flex items-center justify-center">
                          <Trophy className="w-5 h-5 mr-2 text-accent-foreground"/>
                          {highScore ? `${highScore.score} by ${highScore.name}` : 'N/A'}
                        </p>
                    </div>
                </div>
                <Button onClick={() => setGameState('playing')} size="lg" className="mt-8 font-bold text-lg w-full">
                  Start Tapping <ChevronsRight className="ml-2 h-6 w-6"/>
                </Button>
            </div>
          </div>
        );
    }
  };

  return (
    <main className="min-h-screen w-full bg-background flex items-center justify-center p-4 font-body">
      <Card className="relative w-full max-w-2xl flex flex-col h-[90vh] max-h-[800px] overflow-hidden shadow-2xl border-primary/10">
        {gameState === 'idle' && userProfile && (
            <div className="absolute top-4 right-4 z-10">
                <Button variant="ghost" size="sm" onClick={handleLogout}><LogOut className="mr-2 h-4 w-4"/>Log Out</Button>
            </div>
        )}
        <CardContent className="p-0 sm:p-0 flex-grow flex flex-col justify-center">
          {renderGameContent()}
        </CardContent>
      </Card>
    </main>
  );
}

    