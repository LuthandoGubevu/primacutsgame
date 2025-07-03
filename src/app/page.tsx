
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
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';


// Schema for the auth form
const authSchema = z.object({
  firstName: z.string().min(1, { message: "First name is required." }).optional(),
  email: z.string().email({ message: "Please enter a valid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
});
type AuthFormValues = z.infer<typeof authSchema>;

type UserProfile = {
  firstName: string;
  email: string;
  bestScore: number;
  scores: number[];
};

type HighScore = { score: number; name: string };

const GAME_DURATION = 30; // seconds
const ICON_TIMEOUT = 800; // ms

export default function PrimalTapChallengePage() {
  const [gameState, setGameState] = useState<'auth' | 'idle' | 'playing' | 'gameOver'>('auth');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [iconPosition, setIconPosition] = useState({ top: 50, left: 50, visible: false });
  
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

  const form = useForm<AuthFormValues>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      firstName: '',
      email: '',
      password: '',
    },
  });

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
          // This can happen if Firestore doc creation fails after signup.
          // To prevent an inconsistent state, we sign the user out.
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

    // Get initial competitor count
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

    // High Score listener
    const highScoreQuery = query(usersCollection, orderBy("bestScore", "desc"), limit(1));
    const unsubscribeHighScore = onSnapshot(highScoreQuery, 
      (querySnapshot) => { // onNext
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
      (error) => { // onError
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
    setIconPosition(p => ({ ...p, visible: false }));
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
        }, ICON_TIMEOUT);
      }
    }, 300 + Math.random() * 1000);
  }, []);
  
  useEffect(() => {
    if (gameState === 'playing') {
      setTimeLeft(GAME_DURATION);
      setScore(0);
      showNextIcon();
      
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
  }, [gameState, showNextIcon, stopGame]);

  // Score saving logic with Firebase
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
  
  const handlePlayAgain = useCallback(() => setGameState('playing'), []);
  
  const handleLogout = useCallback(async () => {
    await signOut(auth);
    form.reset();
  }, [auth, form]);

  const onAuthSubmit: SubmitHandler<AuthFormValues> = async (data) => {
    if (isLogin) {
      try {
        await signInWithEmailAndPassword(auth, data.email, data.password);
        // onAuthStateChanged will handle UI changes
      } catch (error) {
        toast({ variant: "destructive", title: "Login Failed", description: "Invalid email or password." });
      }
    } else { // Signup
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
        };
        await setDoc(doc(db, "users", newUser.uid), newUserProfile);
        setCompetitors(c => c + 1);
        // onAuthStateChanged will handle UI changes
      } catch (error: any) {
        console.error("Signup failed:", error);
        if (error.code === 'auth/email-already-in-use') {
          toast({ variant: "destructive", title: "Signup Failed", description: "An account with this email already exists." });
        } else {
          toast({ variant: "destructive", title: "Signup Failed", description: "An unexpected error occurred. Please try again." });
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
            <div className="absolute top-4 left-4 right-4 flex justify-between items-center text-primary font-bold p-2 bg-background/80 rounded-md z-10 font-headline">
              <span className="text-2xl md:text-3xl">Time: {timeLeft}s</span>
              <span className="text-2xl md:text-3xl">Score: {score}</span>
            </div>
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
            </div>
          </>
        );
      case 'gameOver':
        return (
          <div className="text-center py-6 flex flex-col justify-center items-center h-full">
            <h2 className="text-2xl font-bold font-headline text-primary mb-2">Time's Up!</h2>
            <p className="text-6xl font-bold font-headline text-accent-foreground mb-4">{score}</p>
            <p className="text-lg text-foreground/80 mb-6">Your final score</p>
            <div className="flex flex-col sm:flex-row gap-4 mt-8">
                <Button variant="outline" onClick={handlePlayAgain}>Play Again</Button>
                <Link href="/leaderboard" passHref>
                    <Button>View Leaderboard</Button>
                </Link>
            </div>
          </div>
        );
      case 'idle':
      default:
        return (
          <div className="text-center py-10 flex flex-col justify-between h-full">
            <div className="absolute top-4 right-4">
                <Button variant="ghost" size="sm" onClick={handleLogout}><LogOut className="mr-2 h-4 w-4"/>Log Out</Button>
            </div>
            <div>
              <Image src="/PC-Elements-15.png" alt="Primal Tap Challenge Logo" width={300} height={300} className="mx-auto mb-4" data-ai-hint="logo emblem" />
              <CardTitle className="text-3xl md:text-4xl font-headline text-primary">Primal Cuts Tap Challenge</CardTitle>
              <CardDescription className="mt-4 text-lg text-foreground/80 max-w-md mx-auto">
                Welcome back, {userProfile?.firstName}! Tap the meat sticks as they appear. You have 30 seconds.
              </CardDescription>
            </div>
            
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-center">
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
    <main className="h-screen w-full bg-background flex items-stretch justify-center p-0 sm:p-4 font-body">
      <div className="w-full max-w-2xl shadow-2xl border-0 sm:border-2 border-primary/10 relative overflow-hidden flex flex-col sm:rounded-lg h-full sm:my-auto sm:h-[800px]">
        <CardContent className="p-4 sm:p-6 flex-grow flex flex-col justify-center">
          {renderGameContent()}
        </CardContent>
      </div>
    </main>
  );
}
