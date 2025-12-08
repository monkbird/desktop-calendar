// src/supabase.ts
import { createClient } from '@supabase/supabase-js';

// 请将以下内容替换为你的 Supabase 项目实际配置
// 在 Vite 中通常使用 import.meta.env.VITE_SUPABASE_URL
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://meykzllvsjngtebcyhba.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1leWt6bGx2c2puZ3RlYmN5aGJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNjk2NjcsImV4cCI6MjA4MDc0NTY2N30.ZDPJcYePqcID4XmEqsviQLMliPN2yId_CEJtnr-vW-0';

export const supabase = createClient(supabaseUrl, supabaseKey);