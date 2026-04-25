'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import LottieView from 'lottie-react-native';
import { useVoice } from '../hooks/use-voice';
import { useAgents } from '../hooks/use-agents';
import { useAuth, User } from '../hooks/use-auth';

interface RouteData {
  type: string;
  start_name: string;
  end_name: string;
  total_distance_m: number;
  instructions: any[];
}

export default function ChatScreen() {
  const [messages, setMessages] = useState<string[]>([]);
  const [transcript, setTranscript] = useState<string>('');
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [selectedAgent, setSelectedAgent] = useState('chatbot');
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [registerFullname, setRegisterFullname] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [registerLoading, setRegisterLoading] = useState(false);
  
  const { agents, isLoading: agentsLoading } = useAgents();
  const { isAuthenticated, user, token, login, logout, register } = useAuth();
  const availableAgents = agents.length > 0 ? agents : [{ key: 'chatbot', description: 'Default chatbot' }];
  
  const eyeLeftRef = useRef<LottieView>(null);
  const eyeRightRef = useRef<LottieView>(null);
  const mouthAnimRef = useRef<LottieView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const handleTranscript = useCallback((text: string) => setTranscript(text), []);
  const handleBotOutput = useCallback((text: string) => setMessages(prev => [...prev, text]), []);
  const handleToolResult = useCallback((result: { toolName: string; content: string }) => {
    if (result.toolName.toLowerCase().includes('route')) {
      try {
        const parsed = JSON.parse(result.content);
        if (parsed.type === 'route' && parsed.status === 'success') setRouteData(parsed);
      } catch {}
    }
  }, []);
  const handleError = useCallback((error: string) => console.error('[Mobile] Voice error:', error), []);

  const voice = useVoice({
    agentId: selectedAgent,
    userId: user?.id || 'guest',
    token: token ?? undefined,
    onTranscript: handleTranscript,
    onBotOutput: handleBotOutput,
    onToolResult: handleToolResult,
    onError: handleError,
  });

  useEffect(() => {
    if (voice.state === 'connected' && voice.isListening) {
      eyeLeftRef.current?.play();
      eyeRightRef.current?.play();
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])).start();
    } else {
      eyeLeftRef.current?.pause();
      eyeRightRef.current?.pause();
      pulseAnim.setValue(1);
    }
  }, [voice.state, voice.isListening]);

  useEffect(() => {
    voice.isSpeaking ? mouthAnimRef.current?.play() : mouthAnimRef.current?.pause();
  }, [voice.isSpeaking]);

  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError('Vui lòng nhập đầy đủ thông tin');
      return;
    }
    setLoginError('');
    setLoginLoading(true);
    try {
      await login(loginEmail, loginPassword);
      setShowLogin(false);
      setLoginEmail('');
      setLoginPassword('');
    } catch (err: any) {
      setLoginError(err.message || 'Đăng nhập thất bại');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!registerFullname.trim() || !registerEmail.trim() || !registerPassword.trim()) {
      setRegisterError('Vui lòng nhập đầy đủ thông tin');
      return;
    }
    setRegisterError('');
    setRegisterLoading(true);
    try {
      await register(registerEmail, registerPassword, registerFullname);
      setShowRegister(false);
      setShowLogin(false);
      setRegisterFullname('');
      setRegisterEmail('');
      setRegisterPassword('');
    } catch (err: any) {
      setRegisterError(err.message || 'Đăng ký thất bại');
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setShowProfile(false);
  };

  const getInitials = (u: User | null) => {
    if (!u) return '?';
    if (u.fullname) return u.fullname.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    return u.email[0]?.toUpperCase() || '?';
  };

  const getDisplayName = (u: User | null) => {
    if (!u) return 'Người dùng';
    return u.display_name || u.fullname || u.email.split('@')[0];
  };

  const getRole = (u: User | null) => {
    if (!u) return 'Người dùng';
    if (u.is_superuser) return 'Quản trị viên';
    if (u.roles?.length) return u.roles.map(r => r.name).join(', ');
    return 'Người dùng';
  };

  const displayText = transcript || messages[messages.length - 1] || '';
  const currentAgent = availableAgents.find(a => a.key === selectedAgent);

  if (showLogin && !showRegister) {
    return (
      <View style={styles.authContainer}>
        <View style={styles.authCard}>
          <Text style={styles.authTitle}>Đăng nhập</Text>
          <Text style={styles.authSubtitle}>Chào mừng bạn trở lại!</Text>
          
          <TextInput
            style={styles.authInput}
            placeholder="Email"
            value={loginEmail}
            onChangeText={setLoginEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            editable={!loginLoading}
          />
          <TextInput
            style={styles.authInput}
            placeholder="Mật khẩu"
            value={loginPassword}
            onChangeText={setLoginPassword}
            secureTextEntry
            editable={!loginLoading}
          />
          
          {loginError ? <Text style={styles.authError}>{loginError}</Text> : null}
          
          <TouchableOpacity
            style={[styles.authPrimaryButton, loginLoading && styles.authPrimaryButtonDisabled]}
            onPress={handleLogin}
            disabled={loginLoading}
          >
            <Text style={styles.authPrimaryButtonText}>
              {loginLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.authLinkButton}
            onPress={() => { setShowRegister(true); setLoginError(''); }}
          >
            <Text style={styles.authLinkText}>
              Chưa có tài khoản? <Text style={styles.authLinkBold}>Đăng ký ngay</Text>
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.authCancelButton}
            onPress={() => { setShowLogin(false); setLoginEmail(''); setLoginPassword(''); setLoginError(''); }}
          >
            <Text style={styles.authCancelText}>Hủy</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (showLogin && showRegister) {
    return (
      <View style={styles.authContainer}>
        <View style={styles.authCard}>
          <Text style={styles.authTitle}>Đăng ký</Text>
          <Text style={styles.authSubtitle}>Tạo tài khoản mới</Text>
          
          <TextInput
            style={styles.authInput}
            placeholder="Họ và tên"
            value={registerFullname}
            onChangeText={setRegisterFullname}
            autoCorrect={false}
            editable={!registerLoading}
          />
          <TextInput
            style={styles.authInput}
            placeholder="Email"
            value={registerEmail}
            onChangeText={setRegisterEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            editable={!registerLoading}
          />
          <TextInput
            style={styles.authInput}
            placeholder="Mật khẩu"
            value={registerPassword}
            onChangeText={setRegisterPassword}
            secureTextEntry
            editable={!registerLoading}
          />
          
          {registerError ? <Text style={styles.authError}>{registerError}</Text> : null}
          
          <TouchableOpacity
            style={[styles.authPrimaryButton, registerLoading && styles.authPrimaryButtonDisabled]}
            onPress={handleRegister}
            disabled={registerLoading}
          >
            <Text style={styles.authPrimaryButtonText}>
              {registerLoading ? 'Đang đăng ký...' : 'Đăng ký'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.authLinkButton}
            onPress={() => { setShowRegister(false); setRegisterError(''); }}
          >
            <Text style={styles.authLinkText}>
              Đã có tài khoản? <Text style={styles.authLinkBold}>Đăng nhập</Text>
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.authCancelButton}
            onPress={() => { setShowLogin(false); setShowRegister(false); setRegisterError(''); }}
          >
            <Text style={styles.authCancelText}>Hủy</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (showProfile && user) {
    return (
      <View style={styles.profileContainer}>
        <View style={styles.profileHeader}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{getInitials(user)}</Text></View>
          <Text style={styles.profileName}>{getDisplayName(user)}</Text>
          <Text style={styles.profileRole}>{getRole(user)}</Text>
          <Text style={styles.profileEmail}>{user.email}</Text>
        </View>
        <TouchableOpacity style={styles.profileButton} onPress={handleLogout}>
          <Text style={styles.profileButtonText}>Đăng xuất</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowProfile(false)}><Text style={styles.profileBack}>Quay lại</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.resultContainer}>
        <ScrollView><Text style={styles.resultText}>{displayText || 'Xin chào, tôi có thể giúp gì?'}</Text></ScrollView>
      </View>

      <Animated.View style={[styles.faceContainer, { transform: [{ scale: pulseAnim }] }]}>
        <View style={styles.eyesRow}>
          <LottieView ref={eyeLeftRef} source={require('../assets/eye_animation.json')} autoPlay={false} loop style={styles.eye} />
          <LottieView ref={eyeRightRef} source={require('../assets/eye_animation.json')} autoPlay={false} loop style={[styles.eye, styles.eyeRight]} />
        </View>
        <View style={styles.blushRow}><View style={styles.blush} /><View style={styles.blush} /></View>
        <View style={styles.mouthWrapper}><LottieView ref={mouthAnimRef} source={require('../assets/mouth_animation.json')} autoPlay={false} loop style={styles.mouth} /></View>
      </Animated.View>

      <View style={styles.hudContainer}>
        <TouchableOpacity style={styles.hudAuthButton} onPress={() => isAuthenticated ? setShowProfile(true) : setShowLogin(true)}>
          <Text style={styles.hudAuthButtonText}>{isAuthenticated ? '👤' : 'Đăng nhập'}</Text>
        </TouchableOpacity>

        <View style={styles.agentPickerContainer}>
          <TouchableOpacity style={styles.agentPickerButton} onPress={() => setShowAgentPicker(!showAgentPicker)} disabled={agentsLoading || voice.state === 'connected'}>
            <Text style={styles.agentPickerText}>{agentsLoading ? 'Loading...' : (currentAgent?.key || selectedAgent)} ▾</Text>
          </TouchableOpacity>
          {showAgentPicker && (
            <View style={styles.agentPickerDropdown}>
              {availableAgents.map((agent) => (
                <TouchableOpacity key={agent.key} style={[styles.agentOption, selectedAgent === agent.key && styles.agentOptionActive]} onPress={() => { if (voice.state !== 'connected') { setSelectedAgent(agent.key); setShowAgentPicker(false); } }}>
                  <Text style={[styles.agentOptionText, selectedAgent === agent.key && styles.agentOptionTextActive]}>{agent.key}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: voice.state === 'connected' ? '#22c55e' : '#6b7280' }]} />
          <Text style={styles.statusText}>
            {voice.state === 'connecting' ? 'Đang kết nối...' : voice.state === 'connected' ? (voice.isListening ? 'Đang nghe...' : 'Đã kết nối') : voice.state === 'error' ? `Lỗi: ${voice.error}` : 'Nhấn để kết nối'}
          </Text>
        </View>

        {voice.state === 'idle' && <TouchableOpacity style={styles.connectButton} onPress={() => voice.startConversation()}><Text style={styles.connectButtonText}>Kết nối</Text></TouchableOpacity>}
      </View>

      {voice.state === 'connected' && (
        <View style={styles.controlsContainer}>
          <TouchableOpacity style={styles.controlButton} onPress={() => voice.toggleMute()}>
            <Text style={styles.controlIcon}>{voice.isMuted ? '🔇' : '🎤'}</Text>
            <Text style={styles.controlLabel}>{voice.isMuted ? 'Mở' : 'Tắt'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.controlButton, styles.controlEndButton]} onPress={() => { voice.stopConversation(); setMessages([]); setRouteData(null); setTranscript(''); }}>
            <Text style={styles.controlIcon}>📞</Text>
            <Text style={styles.controlLabel}>Kết thúc</Text>
          </TouchableOpacity>
        </View>
      )}

      {routeData && (
        <View style={styles.routeOverlay}>
          <View style={styles.routeCard}>
            <Text style={styles.routeTitle}>{routeData.start_name} → {routeData.end_name}</Text>
            <Text style={styles.routeDistance}>~{Math.ceil(routeData.total_distance_m / 80)} phút</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff', flexDirection: 'row' },
  resultContainer: { position: 'absolute', bottom: 24, left: 24, right: 24, height: 80, padding: 12 },
  resultText: { fontSize: 20, color: '#1f2937', textAlign: 'center' },

  authContainer: { flex: 1, backgroundColor: '#1f2937', justifyContent: 'center', alignItems: 'center' },
  authCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 32, width: 360, alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  authTitle: { fontSize: 28, fontWeight: 'bold', color: '#1f2937', marginBottom: 8 },
  authSubtitle: { fontSize: 14, color: '#6b7280', marginBottom: 24 },
  authInput: { width: '100%', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16, marginBottom: 12, fontSize: 16, backgroundColor: '#f9fafb' },
  authError: { color: '#ef4444', fontSize: 14, marginBottom: 12, textAlign: 'center' },
  authPrimaryButton: { width: '100%', backgroundColor: '#2563eb', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  authPrimaryButtonDisabled: { backgroundColor: '#93c5fd' },
  authPrimaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  authLinkButton: { marginTop: 20, padding: 8 },
  authLinkText: { fontSize: 14, color: '#6b7280' },
  authLinkBold: { color: '#2563eb', fontWeight: 'bold' },
  authCancelButton: { marginTop: 12, padding: 8 },
  authCancelText: { color: '#9ca3af', fontSize: 14 },

  profileContainer: { flex: 1, backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center', padding: 24 },
  profileHeader: { alignItems: 'center', marginBottom: 32 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#2563eb', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  avatarText: { color: '#ffffff', fontSize: 28, fontWeight: 'bold' },
  profileName: { fontSize: 24, fontWeight: 'bold', color: '#1f2937' },
  profileRole: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  profileEmail: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  profileButton: { backgroundColor: '#ef4444', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, marginBottom: 16 },
  profileButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  profileBack: { color: '#6b7280', fontSize: 14 },

  faceContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  eyesRow: { flexDirection: 'row', gap: 100 },
  eye: { width: 120, height: 120 },
  eyeRight: { transform: [{ scaleX: -1 }] },
  blushRow: { flexDirection: 'row', position: 'absolute', top: '38%', gap: 160 },
  blush: { width: 50, height: 30, borderRadius: 15, backgroundColor: '#fca5a5', opacity: 0.5 },
  mouthWrapper: { marginTop: 24, width: 140, height: 70 },
  mouth: { width: 140, height: 70 },

  inputContainer: { position: 'absolute', bottom: 24, left: 24, right: 24, flexDirection: 'row', gap: 12 },
  textInput: { flex: 1, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16 },
  sendButton: { backgroundColor: '#2563eb', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, justifyContent: 'center' },
  sendButtonDisabled: { backgroundColor: '#93c5fd' },
  sendButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },

  hudContainer: { position: 'absolute', top: 24, right: 24, alignItems: 'flex-end' },
  hudAuthButton: { marginBottom: 8, padding: 8 },
  hudAuthButtonText: { fontSize: 14, color: '#2563eb' },
  agentPickerContainer: { marginBottom: 8 },
  agentPickerButton: { backgroundColor: '#e5e7eb', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, minWidth: 120 },
  agentPickerText: { fontSize: 14, color: '#1f2937', textAlign: 'center' },
  agentPickerDropdown: { position: 'absolute', top: '100%', right: 0, marginTop: 4, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, minWidth: 160, zIndex: 100 },
  agentOption: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  agentOptionActive: { backgroundColor: '#eff6ff' },
  agentOptionText: { fontSize: 14, color: '#1f2937' },
  agentOptionTextActive: { color: '#2563eb', fontWeight: 'bold' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  statusDot: { width: 12, height: 12, borderRadius: 6, marginRight: 8 },
  statusText: { fontSize: 14, color: '#6b7280' },
  connectButton: { backgroundColor: '#2563eb', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  connectButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },

  controlsContainer: { position: 'absolute', bottom: 24, right: 24, flexDirection: 'row', gap: 12 },
  controlButton: { backgroundColor: '#e5e7eb', padding: 12, borderRadius: 12, alignItems: 'center', minWidth: 60 },
  controlEndButton: { backgroundColor: '#ef4444' },
  controlIcon: { fontSize: 20 },
  controlLabel: { fontSize: 12, color: '#374151', marginTop: 4 },

  routeOverlay: { position: 'absolute', top: 24, left: 24 },
  routeCard: { backgroundColor: '#f9fafb', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  routeTitle: { fontSize: 14, fontWeight: 'bold', color: '#1f2937' },
  routeDistance: { fontSize: 12, color: '#6b7280' },
});