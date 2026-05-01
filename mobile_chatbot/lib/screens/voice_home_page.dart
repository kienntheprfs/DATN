import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import '../models/chat_models.dart';
import '../services/api_client.dart';
import '../services/voice_controller.dart';
import '../utils/constants.dart';
import '../widgets/face_widget.dart';
import '../widgets/route_dialog.dart';
import '../widgets/auth_dialog.dart';
import '../widgets/settings_dialog.dart';

class VoiceHomePage extends StatefulWidget {
  const VoiceHomePage({super.key});

  @override
  State<VoiceHomePage> createState() => _VoiceHomePageState();
}

class _VoiceHomePageState extends State<VoiceHomePage> {
  final api = ApiClient();
  late final voice = VoiceController(api: api, onError: _toast);
  String? token;
  String userId = 'guest';
  String selectedAgent = 'chatbot';
  List<String> agents = ['chatbot'];
  RouteInfo? latestRoute;
  String? lastAutoShownRouteKey;

  @override
  void initState() {
    super.initState();
    voice.addListener(_onVoiceUpdated);
    _loadAgents();
  }

  @override
  void dispose() {
    voice.removeListener(_onVoiceUpdated);
    voice.dispose();
    super.dispose();
  }

  Future<void> _loadAgents() async {
    try {
      final loaded = await api.fetchAgents();
      if (!mounted || loaded.isEmpty) return;
      setState(() {
        agents = loaded;
        if (!agents.contains(selectedAgent)) selectedAgent = agents.first;
      });
    } catch (_) {}
  }

  void _onVoiceUpdated() {
    if (!mounted) return;

    // Find latest route in messages
    RouteInfo? foundRoute;
    for (final msg in voice.messages.reversed) {
      if (msg.route != null) {
        foundRoute = msg.route;
        break;
      }
    }

    setState(() {
      latestRoute = foundRoute;
    });

    if (latestRoute != null) {
      final routeKey = '${latestRoute!.title}|${latestRoute!.summary}';
      if (routeKey != lastAutoShownRouteKey) {
        lastAutoShownRouteKey = routeKey;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          _openRouteModal(latestRoute!);
        });
      }
    }
  }

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        backgroundColor: AppConstants.secondaryColor,
      ),
    );
  }

  Future<void> _toggleVoice() async {
    if (voice.status == VoiceStatus.connected ||
        voice.status == VoiceStatus.connecting) {
      await voice.disconnect();
      return;
    }
    await voice.connect(agentId: selectedAgent, userId: userId, token: token);
  }

  void _openRouteModal(RouteInfo route) {
    showDialog(
      context: context,
      builder: (_) => RouteDialog(route: route),
    );
  }

  Future<void> _openAuthDialog() async {
    final result = await showDialog<(String, String)>(
      context: context,
      builder: (_) => AuthDialog(api: api),
    );
    if (result == null) return;
    setState(() {
      token = result.$1;
      userId = result.$2;
    });
  }

  void _openSettingsDialog() {
    showDialog(
      context: context,
      builder: (context) => SettingsDialog(
        agents: agents,
        selectedAgent: selectedAgent,
        isLoggedIn: token != null,
        isVoiceConnected: voice.status == VoiceStatus.connected,
        onAgentChanged: (val) => setState(() => selectedAgent = val),
        onAuthPressed: _openAuthDialog,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final connected = voice.status == VoiceStatus.connected;
    final connecting = voice.status == VoiceStatus.connecting;
    final latestMessage = voice.messages.isEmpty ? null : voice.messages.last;

    return Scaffold(
      backgroundColor: Colors.white,
      body: Stack(
        children: [
          // Main Face Background
          Positioned.fill(
            child: FaceWidget(
              isConnected: connected,
              isSpeaking: voice.isBotSpeaking,
            ),
          ),

          // Top Control Bar
          Positioned(
            top: MediaQuery.of(context).padding.top + 16,
            left: 20,
            right: 20,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(
                children: [
                  _StatusIndicator(status: voice.status),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          connecting
                              ? 'Đang kết nối...'
                              : (connected ? 'Đang trực tuyến' : 'Ngoại tuyến'),
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          selectedAgent,
                          style: TextStyle(
                            fontSize: 11,
                            color: Colors.grey.shade600,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  _HeaderAction(
                    icon: Icons.settings_outlined,
                    onPressed: _openSettingsDialog,
                  ),
                  const SizedBox(width: 8),
                  _HeaderAction(
                    icon: Icons.close_rounded,
                    onPressed: () async {
                      await voice.disconnect();
                      if (Navigator.canPop(context)) {
                        Navigator.pop(context);
                      }
                    },
                  ),
                ],
              ),
            ),
          ),

          // Bottom Controls and Transcript
          Positioned(
            left: 20,
            right: 20,
            bottom: MediaQuery.of(context).padding.bottom + 20,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Transcript Card
                if (voice.currentTranscript.isNotEmpty || latestMessage != null)
                  Container(
                    margin: const EdgeInsets.only(bottom: 20),
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(
                              voice.currentSpeaker == Role.user
                                  ? Icons.person_rounded
                                  : Icons.smart_toy_rounded,
                              size: 14,
                              color: Colors.white70,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              voice.currentSpeaker == Role.user ? 'BẠN' : 'BOT',
                              style: const TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 1,
                                color: AppConstants.primaryColor,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        MarkdownBody(
                          data: voice.currentTranscript.isNotEmpty
                              ? voice.currentTranscript
                              : (latestMessage?.text ?? ''),
                          styleSheet: MarkdownStyleSheet(
                            p: const TextStyle(
                              fontSize: 15,
                              height: 1.4,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                Row(
                  children: [
                    if (connected) ...[
                      _CircularAction(
                        icon: voice.isMuted
                            ? Icons.mic_off_rounded
                            : Icons.mic_rounded,
                        onPressed: voice.toggleMute,
                        color: voice.isMuted
                            ? AppConstants.errorColor
                            : AppConstants.primaryColor,
                        isActive: !voice.isMuted,
                      ),
                      const SizedBox(width: 16),
                    ],
                    Expanded(
                      child: _MainCallButton(
                        isConnected: connected,
                        isConnecting: connecting,
                        onPressed: _toggleVoice,
                      ),
                    ),
                    if (latestRoute != null) ...[
                      const SizedBox(width: 16),
                      _CircularAction(
                        icon: Icons.map_outlined,
                        onPressed: () => _openRouteModal(latestRoute!),
                        color: Colors.orange.shade600,
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusIndicator extends StatelessWidget {
  const _StatusIndicator({required this.status});
  final VoiceStatus status;

  @override
  Widget build(BuildContext context) {
    Color color = Colors.grey;
    if (status == VoiceStatus.connected) color = Colors.greenAccent.shade700;
    if (status == VoiceStatus.connecting) color = Colors.orangeAccent;
    if (status == VoiceStatus.error) color = Colors.redAccent;

    return Container(
      width: 10,
      height: 10,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: color.withOpacity(0.5),
            blurRadius: 8,
            spreadRadius: 2,
          ),
        ],
      ),
    );
  }
}

class _HeaderAction extends StatelessWidget {
  const _HeaderAction({required this.icon, required this.onPressed});
  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: onPressed,
      style: IconButton.styleFrom(
        backgroundColor: Colors.transparent,
        padding: const EdgeInsets.all(10),
      ),
      icon: Icon(icon, size: 20, color: AppConstants.secondaryColor),
    );
  }
}

class _CircularAction extends StatelessWidget {
  const _CircularAction({
    required this.icon,
    required this.onPressed,
    required this.color,
    this.isActive = true,
  });

  final IconData icon;
  final VoidCallback onPressed;
  final Color color;
  final bool isActive;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onPressed,
      borderRadius: BorderRadius.circular(30),
      child: Container(
        width: 60,
        height: 60,
        decoration: BoxDecoration(
          color: isActive ? color : Colors.white,
          shape: BoxShape.circle,
          border: Border.all(color: color.withOpacity(0.2), width: 2),
          boxShadow: [
            BoxShadow(
              color: color.withOpacity(isActive ? 0.3 : 0.1),
              blurRadius: 15,
              offset: const Offset(0, 5),
            ),
          ],
        ),
        child: Icon(icon, color: isActive ? Colors.white : color, size: 28),
      ),
    );
  }
}

class _MainCallButton extends StatelessWidget {
  const _MainCallButton({
    required this.isConnected,
    required this.isConnecting,
    required this.onPressed,
  });

  final bool isConnected;
  final bool isConnecting;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: isConnecting ? null : onPressed,
      borderRadius: BorderRadius.circular(30),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        height: 60,
        decoration: BoxDecoration(
          color: isConnected
              ? AppConstants.errorColor
              : AppConstants.primaryColor,
          borderRadius: BorderRadius.circular(30),
          boxShadow: [
            BoxShadow(
              color:
                  (isConnected
                          ? AppConstants.errorColor
                          : AppConstants.primaryColor)
                      .withOpacity(0.4),
              blurRadius: 20,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              isConnected ? Icons.call_end_rounded : Icons.mic_rounded,
              color: Colors.white,
            ),
            const SizedBox(width: 12),
            Text(
              isConnecting
                  ? 'ĐANG KẾT NỐI'
                  : (isConnected ? 'KẾT THÚC' : 'BẮT ĐẦU NÓI'),
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.2,
                fontSize: 14,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
