// src/supabase.ts
import { createClient } from '@supabase/supabase-js';

// 配置从环境变量读取（Vite 在构建时内联）：
//   在根目录 .env 中配置（该文件已被 gitignore，请勿提交真实 Key 到仓库）
//   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseKey) {
  // 缺配置时不阻断应用：降级为纯本地模式，云同步不可用
  console.warn('[supabase] 未配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY，将以纯本地模式运行（云同步不可用）');
}

export const supabase = createClient(
  supabaseUrl || 'https://not-configured.supabase.co',
  supabaseKey || 'not-configured'
);
