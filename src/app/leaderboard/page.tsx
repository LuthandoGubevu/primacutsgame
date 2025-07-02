
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Crown } from 'lucide-react';

// This should ideally be a shared type
type User = {
  firstName: string;
  scores: number[];
  email: string;
  password?: string;
};

type LeaderboardEntry = {
  name: string;
  bestScore: number;
};

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    try {
      const storedUsers: User[] = JSON.parse(localStorage.getItem('primal-tap-users') || '[]');
      const processedScores = storedUsers
        .map(user => ({
          name: user.firstName,
          bestScore: user.scores.length > 0 ? Math.max(...user.scores) : 0,
        }))
        .filter(user => user.bestScore > 0) // Only show users who have played
        .sort((a, b) => b.bestScore - a.bestScore);
      
      setLeaderboard(processedScores);
    } catch (error) {
      console.error("Failed to load or process leaderboard data:", error);
    }
  }, []);

  return (
    <main className="h-screen w-full bg-background flex items-center justify-center p-4 font-body">
      <Card className="w-full max-w-2xl shadow-2xl border-2 border-primary/10 relative overflow-hidden flex flex-col sm:rounded-lg h-full sm:h-auto sm:max-h-[90vh]">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl md:text-4xl font-headline text-primary">Leaderboard</CardTitle>
          <CardDescription>See who is the top tapper!</CardDescription>
        </CardHeader>
        <CardContent className="flex-grow overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px] text-center">Rank</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">Best Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboard.length > 0 ? (
                leaderboard.map((entry, index) => (
                  <TableRow key={index} className={index === 0 ? 'bg-primary/10' : ''}>
                    <TableCell className="font-bold text-center text-lg">
                        {index === 0 ? <Crown className="w-6 h-6 mx-auto text-primary" /> : index + 1}
                    </TableCell>
                    <TableCell className="font-medium">{entry.name}</TableCell>
                    <TableCell className="text-right font-bold text-lg text-primary">{entry.bestScore}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-10">
                    No scores recorded yet. Be the first to play!
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
        <div className="p-6 border-t border-primary/10">
            <Link href="/" passHref>
                <Button className="w-full" variant="outline">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Game
                </Button>
            </Link>
        </div>
      </Card>
    </main>
  );
}
