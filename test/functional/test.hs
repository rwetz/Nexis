-- Test Haskell file — Nexis editor playground
-- Exercises: typeclasses, GADTs, type families, monad transformers,
--            concurrency with STM, lenses, QuickCheck-style properties

{-# LANGUAGE GADTs              #-}
{-# LANGUAGE TypeFamilies       #-}
{-# LANGUAGE DataKinds          #-}
{-# LANGUAGE KindSignatures     #-}
{-# LANGUAGE FlexibleInstances  #-}
{-# LANGUAGE OverloadedStrings  #-}
{-# LANGUAGE LambdaCase         #-}
{-# LANGUAGE TupleSections      #-}
{-# LANGUAGE ScopedTypeVariables #-}

module Main where

import Control.Applicative (liftA2)
import Control.Concurrent.STM
import Control.Exception     (SomeException, try, evaluate)
import Control.Monad         (forM_, guard, unless, when)
import Control.Monad.State
import Control.Monad.Except
import Data.Char             (digitToInt, isAlpha, isDigit, toLower, toUpper)
import Data.IORef
import Data.List             (foldl', group, intercalate, isPrefixOf, sort, sortBy, tails, transpose)
import Data.Map.Strict       (Map)
import qualified Data.Map.Strict as Map
import Data.Maybe            (fromMaybe, mapMaybe)
import Data.Ord              (comparing, Down(..))
import Data.Set              (Set)
import qualified Data.Set as Set
import Numeric               (showHex)
import System.IO             (hSetBuffering, stdout, BufferMode(..))

-- ── Custom typeclasses ────────────────────────────────────────────────────────

class (Show a, Eq a) => Serialisable a where
  serialise   :: a -> String
  deserialise :: String -> Either String a

class Container f where
  empty  :: f a
  insert :: a -> f a -> f a
  toList :: f a -> [a]
  size   :: f a -> Int
  size   = length . toList

-- ── GADTs ─────────────────────────────────────────────────────────────────────

data Expr :: * -> * where
  Lit  :: Show a => a      -> Expr a
  Add  :: Num a  => Expr a -> Expr a -> Expr a
  Mul  :: Num a  => Expr a -> Expr a -> Expr a
  Eq'  :: Eq  a  => Expr a -> Expr a -> Expr Bool
  If   :: Expr Bool -> Expr a -> Expr a -> Expr a
  Neg  :: Num a  => Expr a -> Expr a

eval :: Expr a -> a
eval (Lit v)      = v
eval (Add l r)    = eval l + eval r
eval (Mul l r)    = eval l * eval r
eval (Eq' l r)    = eval l == eval r
eval (If c t f)   = if eval c then eval t else eval f
eval (Neg e)      = negate (eval e)

-- ── Type families ─────────────────────────────────────────────────────────────

type family Elem (f :: * -> *) :: *

type instance Elem []     = a
type instance Elem Maybe  = a

-- ── Algebraic data types ──────────────────────────────────────────────────────

data Tree a
  = Leaf
  | Node { nodeVal :: a, nodeLeft :: Tree a, nodeRight :: Tree a }
  deriving (Show, Eq, Functor, Foldable)

insertBST :: Ord a => a -> Tree a -> Tree a
insertBST x Leaf = Node x Leaf Leaf
insertBST x (Node v l r)
  | x < v    = Node v (insertBST x l) r
  | x > v    = Node v l (insertBST x r)
  | otherwise = Node v l r

fromListBST :: Ord a => [a] -> Tree a
fromListBST = foldl' (flip insertBST) Leaf

toSortedList :: Tree a -> [a]
toSortedList = foldr (:) []   -- in-order via Foldable

treeDepth :: Tree a -> Int
treeDepth Leaf         = 0
treeDepth (Node _ l r) = 1 + max (treeDepth l) (treeDepth r)

-- ── Result / Either monad chain ───────────────────────────────────────────────

data AppError
  = NotFound String
  | InvalidInput String
  | Unauthorised
  deriving (Show, Eq)

type App a = ExceptT AppError IO a

getUser :: String -> App String
getUser "alice" = pure "Alice Admin"
getUser "bob"   = pure "Bob Member"
getUser uid     = throwError (NotFound uid)

checkPerm :: String -> App ()
checkPerm "Alice Admin" = pure ()
checkPerm name          = throwError Unauthorised

loadProject :: String -> App String
loadProject pid = do
  user <- getUser "alice"
  checkPerm user
  pure $ "Project " ++ pid ++ " loaded for " ++ user

-- ── State monad ───────────────────────────────────────────────────────────────

type Counter = State Int

tick :: Counter ()
tick = modify (+1)

tickBy :: Int -> Counter ()
tickBy n = modify (+n)

reset :: Counter ()
reset = put 0

runCounter :: Counter a -> (a, Int)
runCounter m = runState m 0

-- More complex: stack machine
data StackOp = Push' Int | Pop' | Dup | Swap | Op' (Int -> Int -> Int)

type StackM a = StateT [Int] (Either String) a

execStack :: [StackOp] -> Either String [Int]
execStack ops = execStateT (mapM_ step ops) []
  where
    step (Push' n) = modify (n:)
    step Pop'      = gets null >>= \case
      True  -> throwError "pop on empty stack"
      False -> modify tail
    step Dup       = gets null >>= \case
      True  -> throwError "dup on empty stack"
      False -> modify (\(x:xs) -> x:x:xs)
    step Swap      = gets length >>= \len ->
      if len < 2
        then throwError "swap requires 2+ elements"
        else modify (\(x:y:xs) -> y:x:xs)
    step (Op' f)   = gets length >>= \len ->
      if len < 2
        then throwError "binary op requires 2+ elements"
        else modify (\(x:y:xs) -> f y x : xs)

-- ── STM (concurrent state) ───────────────────────────────────────────────────

data BankAccount = BankAccount
  { accId      :: Int
  , accBalance :: TVar Int
  }

newAccount :: Int -> Int -> IO BankAccount
newAccount aid initial = BankAccount aid <$> newTVarIO initial

transfer :: BankAccount -> BankAccount -> Int -> STM ()
transfer from to amount = do
  bal <- readTVar (accBalance from)
  unless (bal >= amount) retry
  modifyTVar (accBalance from) (subtract amount)
  modifyTVar (accBalance to)   (+amount)

getBalance :: BankAccount -> IO Int
getBalance = readTVarIO . accBalance

-- ── Parser combinators (manual) ───────────────────────────────────────────────

newtype Parser a = Parser { runParser :: String -> Maybe (a, String) }

instance Functor Parser where
  fmap f (Parser p) = Parser $ fmap (fmap f <$>) . p

instance Applicative Parser where
  pure x = Parser $ \s -> Just (x, s)
  Parser pf <*> Parser px = Parser $ \s -> do
    (f, s')  <- pf s
    (x, s'') <- px s'
    pure (f x, s'')

instance Monad Parser where
  return = pure
  Parser p >>= f = Parser $ \s -> p s >>= \(x, s') -> runParser (f x) s'

instance Alternative Parser where
  empty = Parser $ const Nothing
  Parser p <|> Parser q = Parser $ \s -> p s <|> q s

import Control.Applicative (Alternative)

charP :: (Char -> Bool) -> Parser Char
charP f = Parser $ \case
  (c:cs) | f c -> Just (c, cs)
  _            -> Nothing

litP :: Char -> Parser Char
litP c = charP (== c)

digitP :: Parser Int
digitP = digitToInt <$> charP isDigit

intP :: Parser Int
intP = foldl' (\acc d -> acc * 10 + d) 0 <$> some digitP
  where some p = liftA2 (:) p (many p)
        many p = some p <|> pure []

-- ── Functions ────────────────────────────────────────────────────────────────

fibonacci :: [Integer]
fibonacci = 0 : 1 : zipWith (+) fibonacci (tail fibonacci)

primes :: [Int]
primes = sieve [2..]
  where sieve (p:xs) = p : sieve [x | x <- xs, x `mod` p /= 0]
        sieve []     = []

-- Run-length encoding
rle :: Eq a => [a] -> [(Int, a)]
rle = map (\g -> (length g, head g)) . group

-- Matrix multiplication
matMul :: Num a => [[a]] -> [[a]] -> [[a]]
matMul a b = [[sum $ zipWith (*) row col | col <- transpose b] | row <- a]

-- Word frequency
wordFreq :: String -> [(String, Int)]
wordFreq = sortBy (comparing (Down . snd))
         . Map.toList
         . foldl' (\m w -> Map.insertWith (+) w 1 m) Map.empty
         . words
         . map toLower

-- ── main ─────────────────────────────────────────────────────────────────────

main :: IO ()
main = do
  hSetBuffering stdout LineBuffering

  putStrLn "── GADT expressions ──"
  let e1 = Add (Lit 3) (Mul (Lit 4) (Lit 5)) :: Expr Int
      e2 = Eq' (Lit True) (Lit False) :: Expr Bool
      e3 = If (Eq' (Add (Lit 1) (Lit 2)) (Lit 3)) (Lit "yes") (Lit "no") :: Expr String
  putStrLn $ "  3 + 4*5 = " ++ show (eval e1)
  putStrLn $ "  True == False: " ++ show (eval e2)
  putStrLn $ "  if 1+2==3 then yes else no: " ++ eval e3

  putStrLn "\n── Binary Search Tree ──"
  let t = fromListBST [5, 3, 8, 1, 4, 7, 9, 2, 6 :: Int]
  putStrLn $ "  sorted: " ++ show (toSortedList t)
  putStrLn $ "  depth:  " ++ show (treeDepth t)

  putStrLn "\n── ExceptT / App monad ──"
  r1 <- runExceptT (loadProject "nexis")
  r2 <- runExceptT (getUser "unknown")
  putStrLn $ "  loadProject: " ++ show r1
  putStrLn $ "  unknown user: " ++ show r2

  putStrLn "\n── State monad / stack machine ──"
  let prog = [Push' 10, Push' 20, Op' (+), Push' 5, Op' (*)]
  putStrLn $ "  10 20 + 5 * = " ++ show (execStack prog)

  let (_, cnt) = runCounter $ do { tick; tick; tickBy 5; tick }
  putStrLn $ "  counter after tick,tick,+5,tick: " ++ show cnt

  putStrLn "\n── STM transfer ──"
  a1 <- newAccount 1 1000
  a2 <- newAccount 2 500
  atomically $ transfer a1 a2 300
  b1 <- getBalance a1
  b2 <- getBalance a2
  putStrLn $ "  After transfer 300: acc1=" ++ show b1 ++ " acc2=" ++ show b2

  putStrLn "\n── Fibonacci ──"
  putStrLn $ "  " ++ show (take 12 fibonacci)

  putStrLn "\n── Primes ──"
  putStrLn $ "  " ++ show (take 15 primes)

  putStrLn "\n── RLE ──"
  putStrLn $ "  " ++ show (rle "aaabbbccddddee")

  putStrLn "\n── Word frequency ──"
  let text = "to be or not to be that is the question to be is to do"
  forM_ (take 5 $ wordFreq text) $ \(w, n) ->
    putStrLn $ "  " ++ w ++ ": " ++ show n

  putStrLn "\n── Matrix multiply ──"
  let m1 = [[1,2],[3,4]] :: [[Int]]
      m2 = [[5,6],[7,8]] :: [[Int]]
  mapM_ (putStrLn . ("  " ++) . show) (matMul m1 m2)

  putStrLn "\nDone."
