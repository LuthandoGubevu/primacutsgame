"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronsRight, Target } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

// Schema for the email form
const emailSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address." }),
});
type EmailFormValues = z.infer<typeof emailSchema>;

const GAME_DURATION = 30; // seconds
const ICON_TIMEOUT = 800; // ms

// The main game component
export default function PrimalTapChallengePage() {
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'gameOver' | 'submitted'>('idle');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [iconPosition, setIconPosition] = useState({ top: 50, left: 50, visible: false });

  const iconTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const gameLoopTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const gameAreaRef = useRef<HTMLDivElement>(null);

  const form = useForm<EmailFormValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: {
      email: '',
    },
  });

  const stopGame = useCallback(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (iconTimeoutRef.current) clearTimeout(iconTimeoutRef.current);
    if (gameLoopTimeoutRef.current) clearTimeout(gameLoopTimeoutRef.current);

    timerIntervalRef.current = null;
    iconTimeoutRef.current = null;
    gameLoopTimeoutRef.current = null;

    setIconPosition(p => ({ ...p, visible: false }));
  }, []);

  const showNextIcon = useCallback(() => {
    if (gameLoopTimeoutRef.current) {
      clearTimeout(gameLoopTimeoutRef.current);
    }
    gameLoopTimeoutRef.current = setTimeout(() => {
      if (gameAreaRef.current) {
        const gameArea = gameAreaRef.current.getBoundingClientRect();
        // Ensure icon (80x80) stays within bounds
        const top = Math.random() * (gameArea.height - 80);
        const left = Math.random() * (gameArea.width - 80);

        setIconPosition({ top, left, visible: true });

        if (iconTimeoutRef.current) {
          clearTimeout(iconTimeoutRef.current);
        }
        iconTimeoutRef.current = setTimeout(() => {
          setIconPosition(p => ({ ...p, visible: false }));
          showNextIcon();
        }, ICON_TIMEOUT);
      }
    }, 300 + Math.random() * 1000); // Appear between 0.3s and 1.3s
  }, []);

  useEffect(() => {
    if (gameState === 'playing') {
      setTimeLeft(GAME_DURATION);
      setScore(0);
      form.reset();
      
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

    return () => {
      stopGame();
    };
  }, [gameState, showNextIcon, stopGame, form]);


  const handleIconClick = () => {
    if (!iconPosition.visible || gameState !== 'playing') return;
    
    setScore(prevScore => prevScore + 1);
    
    if (iconTimeoutRef.current) clearTimeout(iconTimeoutRef.current);
    setIconPosition(p => ({ ...p, visible: false }));
    
    // Immediately try to show the next icon
    if (gameLoopTimeoutRef.current) clearTimeout(gameLoopTimeoutRef.current);
    showNextIcon();
  };
  
  const handlePlayAgain = () => {
    setGameState('playing');
  };

  const onEmailSubmit: SubmitHandler<EmailFormValues> = (data) => {
    console.log('Email submitted:', data.email);
    setGameState('submitted');
  };

  const renderGameContent = () => {
    switch (gameState) {
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
                    <Image src="/logo.png" alt="Meat Stick" width={80} height={80} className="animate-pulse hover:scale-110 transition-transform" />
                  </button>
                )}
            </div>
          </>
        );
      case 'gameOver':
      case 'submitted':
        return (
          <div className="text-center py-6">
            <h2 className="text-2xl font-bold font-headline text-primary mb-2">Time's Up!</h2>
            <p className="text-5xl font-bold font-headline text-accent mb-4">{score}</p>
            <p className="text-lg text-foreground/80 mb-6">Your final score</p>
            
            {gameState === 'gameOver' ? (
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onEmailSubmit)} className="space-y-4 max-w-sm mx-auto">
                        <p className="text-muted-foreground">Enter your email to join the leaderboard and get a prize code!</p>
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel className="sr-only">Email</FormLabel>
                                <FormControl>
                                    <Input placeholder="your.email@example.com" {...field} className="text-center bg-white" />
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                        <Button type="submit" className="w-full" size="lg">Claim Prize</Button>
                    </form>
                </Form>
            ) : (
                <div className="bg-accent/20 p-6 rounded-lg max-w-sm mx-auto">
                    <h3 className="text-lg font-bold text-primary font-headline">Thank You!</h3>
                    <p className="text-muted-foreground mb-4">Here's your prize code:</p>
                    <p className="text-4xl font-bold font-headline text-accent tracking-widest bg-background p-3 rounded-md">PRIMAL10</p>
                </div>
            )}
             <Button variant="outline" onClick={handlePlayAgain} className="mt-8">Play Again</Button>
          </div>
        );
      case 'idle':
      default:
        return (
          <div className="text-center py-10">
            <Target className="w-24 h-24 mx-auto text-primary/50 mb-4" />
            <CardTitle className="text-3xl md:text-4xl font-headline text-primary">Primal Cuts Tap Challenge</CardTitle>
            <CardDescription className="mt-4 text-lg text-foreground/80 max-w-md mx-auto">
                Tap the meat sticks as they appear. You have 30 seconds to get the highest score. Ready to test your primal instincts?
            </CardDescription>
            <Button onClick={() => setGameState('playing')} size="lg" className="mt-8 font-bold text-lg">
              Start Tapping <ChevronsRight className="ml-2 h-6 w-6"/>
            </Button>
          </div>
        );
    }
  };

  return (
    <main className="min-h-screen w-full bg-background flex items-stretch sm:items-center justify-center p-0 sm:p-4 font-body">
      <Card className="w-full max-w-2xl shadow-2xl sm:border-2 border-primary/10 relative overflow-hidden flex flex-col sm:rounded-lg h-full sm:h-auto">
        <CardContent className="p-4 sm:p-6 flex-grow flex flex-col justify-center">
          {renderGameContent()}
        </CardContent>
      </Card>
    </main>
  );
}
