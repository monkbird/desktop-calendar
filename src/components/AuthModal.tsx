import { useState, useRef, useEffect } from 'react';
import { supabase } from '../supabase';
import { X, AlertCircle } from 'lucide-react';

export const AuthModal = ({ onClose }: { onClose: () => void }) => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  
  // 新增：错误信息状态
  const [errorMsg, setErrorMsg] = useState('');
  
  // 新增：用于自动聚焦的引用
  const passwordRef = useRef<HTMLInputElement>(null);

  // 切换模式时清空错误和密码
  useEffect(() => {
    setErrorMsg('');
    setPassword('');
    setConfirmPassword('');
  }, [isSignUp]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(''); // 开始前清空旧错误

    // 客户端校验
    if (isSignUp && password !== confirmPassword) {
      setErrorMsg("两次输入的密码不一致");
      setConfirmPassword('');
      passwordRef.current?.focus();
      return;
    }

    setLoading(true);
    
    // 发起请求
    const { error } = isSignUp 
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    
    setLoading(false);

    if (error) {
      // 登录/注册失败逻辑
      // 1. 显示错误信息（不使用 alert）
      // 将英文错误简单翻译一下，提升体验
      let msg = error.message;
      if (msg.includes("Invalid login credentials")) msg = "账号或密码错误";
      if (msg.includes("User already registered")) msg = "该邮箱已被注册";
      if (msg.includes("Rate limit")) msg = "操作太频繁，请稍后再试";
      
      setErrorMsg(msg);
      
      // 2. 清空密码框并自动聚焦，方便立即重试
      setPassword('');
      if (isSignUp) setConfirmPassword('');
      passwordRef.current?.focus();
    } else {
      // 成功
      onClose(); 
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-80 bg-[#1a1b1e] border border-white/10 rounded-xl p-6 relative shadow-2xl animate-in zoom-in-95 duration-200">
        <button 
          onClick={onClose} 
          className="absolute top-3 right-3 text-slate-400 hover:text-white transition-colors"
        >
          <X size={16} />
        </button>
        
        <h2 className="text-white text-lg font-bold mb-4">
          {isSignUp ? '注册同步账号' : '登录同步账号'}
        </h2>
        
        <form onSubmit={handleAuth} className="space-y-3">
          <input 
            className="w-full bg-black/30 border border-white/10 rounded p-2 text-white text-sm outline-none focus:border-emerald-500 transition-colors" 
            type="email" 
            placeholder="邮箱" 
            value={email} 
            onChange={e => setEmail(e.target.value)} 
            required 
          />
          <input 
            ref={passwordRef} // 绑定 ref
            className="w-full bg-black/30 border border-white/10 rounded p-2 text-white text-sm outline-none focus:border-emerald-500 transition-colors" 
            type="password" 
            placeholder="密码" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            required 
          />
          
          {isSignUp && (
            <input 
              className="w-full bg-black/30 border border-white/10 rounded p-2 text-white text-sm outline-none focus:border-emerald-500 transition-colors animate-in slide-in-from-top-2 duration-200" 
              type="password" 
              placeholder="确认密码" 
              value={confirmPassword} 
              onChange={e => setConfirmPassword(e.target.value)} 
              required 
            />
          )}

          {/* 错误提示区域 */}
          {errorMsg && (
            <div className="flex items-center gap-2 text-red-400 text-xs bg-red-400/10 p-2 rounded animate-in fade-in slide-in-from-top-1">
              <AlertCircle size={14} className="flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button 
            type="submit"
            disabled={loading} 
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded p-2 text-sm font-bold transition-all active:scale-[0.98]"
          >
            {loading ? '处理中...' : isSignUp ? '立即注册' : '立即登录'}
          </button>
        </form>
        
        <div className="mt-4 text-center">
          <button 
            type="button"
            onClick={() => setIsSignUp(!isSignUp)} 
            className="text-xs text-slate-400 hover:text-emerald-400 underline transition-colors cursor-pointer select-none"
          >
            {isSignUp ? '已有账号？去登录' : '没有账号？去注册'}
          </button>
        </div>
      </div>
    </div>
  );
};