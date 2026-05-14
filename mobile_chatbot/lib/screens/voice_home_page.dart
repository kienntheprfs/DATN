import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import '../models/chat_models.dart';
import '../services/api_client.dart';
import '../services/voice_controller.dart';
import '../utils/constants.dart';
import '../widgets/face_widget.dart';
import '../widgets/route_dialog.dart';
import '../widgets/auth_dialog.dart';
import '../widgets/landmark_carousel.dart';
import '../widgets/confirmation_options.dart';
import 'history_list_screen.dart';

class VoiceHomePage extends StatefulWidget {
  const VoiceHomePage({super.key});

  @override
  State<VoiceHomePage> createState() => _VoiceHomePageState();
}

class _VoiceHomePageState extends State<VoiceHomePage> with WidgetsBindingObserver {
  final api = ApiClient();
  late final voice = VoiceController(api: api, onError: _toast);
  String? token;
  String userId = '';
  String selectedAgent = 'knowledge-base-agent';
  bool _isLoading = false;
  List<String> agents = ['knowledge-base-agent', 'map-assistant'];
  RouteInfo? latestRoute;
  String? lastAutoShownRouteKey;
  List<Landmark>? latestLandmarks;
  String? lastAutoShownLandmarksKey;
  String? latestConfirmationJson;
  String? lastAutoShownConfirmationKey;
  final _transcriptScrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    userId = voice.guestUserId;
    WidgetsBinding.instance.addObserver(this);
    voice.addListener(_onVoiceUpdated);
    voice.addListener(_autoScrollTranscript);
    _loadAgents();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    voice.removeListener(_onVoiceUpdated);
    voice.removeListener(_autoScrollTranscript);
    _transcriptScrollController.dispose();
    voice.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused || state == AppLifecycleState.detached) {
      voice.disconnect();
    }
  }

  Future<void> _loadAgents() async {
    try {
      final loaded = await api.fetchAgents();
      if (!mounted || loaded.isEmpty) return;
      setState(() {
        agents = loaded;
        // Map common keys to friendly names if needed
        if (!agents.contains(selectedAgent)) {
           if (agents.contains('knowledge-base-agent')) {
             selectedAgent = 'knowledge-base-agent';
           } else if (agents.contains('map-assistant')) {
             selectedAgent = 'map-assistant';
           } else if (agents.isNotEmpty) {
             selectedAgent = agents.first;
           }
        }
      });
    } catch (_) {}
  }

  void _onVoiceUpdated() {
    if (!mounted) return;

    // Find latest route, landmarks, and confirmation in messages
    RouteInfo? foundRoute;
    List<Landmark>? foundLandmarks;
    String? foundConfirmation;
    
    for (final msg in voice.messages.reversed) {
      if (foundRoute == null && msg.route != null) {
        foundRoute = msg.route;
      }
      if (foundLandmarks == null && msg.landmarks != null) {
        foundLandmarks = msg.landmarks;
      }
      if (foundConfirmation == null && msg.confirmationJson != null) {
        foundConfirmation = msg.confirmationJson;
      }
      if (foundRoute != null && foundLandmarks != null && foundConfirmation != null) break;
    }

    setState(() {
      latestRoute = foundRoute;
      latestLandmarks = foundLandmarks;
      latestConfirmationJson = foundConfirmation;
    });

    // Auto show confirmation dialog (priority: higher than route)
    if (latestConfirmationJson != null) {
      if (latestConfirmationJson != lastAutoShownConfirmationKey) {
        lastAutoShownConfirmationKey = latestConfirmationJson;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          _openConfirmationDialog(latestConfirmationJson!);
        });
      }
    }

    // Auto show route
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

    // Auto show landmarks
    if (latestLandmarks != null) {
      final landmarksKey = latestLandmarks!.map((e) => e.id).join(',');
      if (landmarksKey != lastAutoShownLandmarksKey) {
        lastAutoShownLandmarksKey = landmarksKey;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          _openLandmarkModal(latestLandmarks!);
        });
      }
    }
  }

  void _autoScrollTranscript() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_transcriptScrollController.hasClients) {
        _transcriptScrollController.jumpTo(
          _transcriptScrollController.position.maxScrollExtent,
        );
      }
    });
  }

  void _toast(String message) {
    if (!mounted) return;
    
    final overlay = Overlay.of(context);
    final entry = OverlayEntry(
      builder: (context) => _PremiumToast(
        message: message,
        onDismiss: () {},
      ),
    );

    overlay.insert(entry);
    Future.delayed(const Duration(seconds: 3), () {
      if (entry.mounted) entry.remove();
    });
  }

  Future<void> _switchAgent(String agentId) async {
    if (selectedAgent == agentId) return;
    
    setState(() => selectedAgent = agentId);

    if (voice.status == VoiceStatus.connected) {
      voice.updateAgent(agentId);
      _toast("Đã chuyển sang agent mới");
    } else if (voice.status == VoiceStatus.idle || voice.status == VoiceStatus.disconnected) {
      // Not connected, nothing to do — next connect will use selectedAgent
      _toast("Đã chọn agent: $agentId");
    } else {
      // connecting, error — disconnect and reconnect fresh
      setState(() => _isLoading = true);
      try {
        await voice.disconnect();
        await Future.delayed(const Duration(milliseconds: 300));
        await voice.connect(agentId: agentId, userId: userId, token: token);
        _toast("Đã chuyển sang agent mới");
      } catch (e) {
        _toast("Lỗi khi chuyển agent: $e");
      } finally {
        if (mounted) setState(() => _isLoading = false);
      }
    }
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

  void _openLandmarkModal(List<Landmark> landmarks) {
    showDialog(
      context: context,
      builder: (_) => LandmarkCarouselDialog(
        landmarks: landmarks,
        onConfirm: (landmark) {
          Navigator.pop(context);
          final text = 'Tôi đang ở ${landmark.name}';
          voice.sendTextMessage(text);
          _toast('Đã xác nhận vị trí: ${landmark.name}');
        },
      ),
    );
  }

  void _openConfirmationDialog(String confirmationJson) {
    showDialog(
      context: context,
      builder: (_) => ConfirmationOptionsDialog(
        confirmationJson: confirmationJson,
        onConfirm: (text) {
          voice.sendTextMessage(text);
          _toast('Đã gửi xác nhận: $text');
        },
      ),
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

  void _logout() {
    setState(() {
      token = null;
      userId = voice.guestUserId;
    });
    _toast('Đã đăng xuất');
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
                    child: Row(
                      children: [
                        _AgentTab(
                          label: 'HỎI ĐÁP',
                          isSelected: selectedAgent == 'knowledge-base-agent',
                          onPressed: () => _switchAgent('knowledge-base-agent'),
                        ),
                        const SizedBox(width: 8),
                        _AgentTab(
                          label: 'CHỈ ĐƯỜNG',
                          isSelected: selectedAgent == 'map-assistant',
                          onPressed: () => _switchAgent('map-assistant'),
                        ),
                      ],
                    ),
                  ),
                  _HeaderAction(
                    icon: Icons.history_rounded,
                    onPressed: () async {
                      if (token == null) {
                        final result = await showDialog<(String, String)>(
                          context: context,
                          builder: (_) => AuthDialog(api: api),
                        );
                        if (result != null) {
                          setState(() {
                            token = result.$1;
                            userId = result.$2;
                          });
                        } else {
                          return;
                        }
                      }
                      
                      if (!mounted) return;
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => HistoryListScreen(
                            token: token!,
                            api: api,
                          ),
                        ),
                      );
                    },
                  ),
                  const SizedBox(width: 4),
                  if (token != null)
                    _HeaderAction(
                      icon: Icons.logout_rounded,
                      onPressed: () async {
                        await voice.disconnect();
                        _logout();
                      },
                    ),
                  const SizedBox(width: 4),
                  _HeaderAction(
                    icon: Icons.close_rounded,
                    onPressed: () async {
                      await voice.disconnect();
                      _logout();
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
                if (voice.transcriptHistory.isNotEmpty || voice.currentTranscript.isNotEmpty)
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Icon(
                            voice.currentSpeaker == Role.user
                                ? Icons.person_rounded
                                : Icons.smart_toy_rounded,
                            size: 14,
                            color: voice.currentSpeaker == Role.user ? Colors.blue : Colors.purple,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            voice.currentSpeaker == Role.user ? 'BẠN' : 'BOT',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 1,
                              color: voice.currentSpeaker == Role.user ? Colors.blue : Colors.purple,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxHeight: 90),
                        child: SingleChildScrollView(
                          controller: _transcriptScrollController,
                          child: MarkdownBody(
                            data: voice.currentTranscript.isNotEmpty
                                ? voice.currentTranscript
                                : voice.transcriptHistory.join('\n'),
                            styleSheet: MarkdownStyleSheet(
                              p: const TextStyle(
                                fontSize: 15,
                                height: 1.4,
                                fontWeight: FontWeight.w500,
                                color: Colors.black87,
                              ),
                              img: const TextStyle(
                                fontSize: 10,
                              ),
                            ),
                            imageBuilder: (uri, title, alt) {
                              return Container(
                                margin: const EdgeInsets.symmetric(vertical: 8),
                                constraints: const BoxConstraints(maxHeight: 180),
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(12),
                                  boxShadow: [
                                    BoxShadow(
                                      color: Colors.black.withOpacity(0.05),
                                      blurRadius: 10,
                                    ),
                                  ],
                                ),
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(12),
                                  child: Image.network(
                                    AppConstants.getFullImageUrl(uri.toString()),
                                    fit: BoxFit.contain,
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                      ),
                    ],
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
                    if (latestRoute != null || latestLandmarks != null || latestConfirmationJson != null) ...[
                      const SizedBox(width: 16),
                      if (latestConfirmationJson != null)
                        _CircularAction(
                          icon: Icons.navigation_rounded,
                          onPressed: () => _openConfirmationDialog(latestConfirmationJson!),
                          color: Colors.purple.shade600,
                        ),
                      if (latestLandmarks != null) ...[
                        if (latestConfirmationJson != null) const SizedBox(width: 8),
                        _CircularAction(
                          icon: Icons.image_search_rounded,
                          onPressed: () => _openLandmarkModal(latestLandmarks!),
                          color: Colors.blue.shade600,
                        ),
                      ],
                      if (latestRoute != null) ...[
                        if (latestConfirmationJson != null || latestLandmarks != null) const SizedBox(width: 8),
                        _CircularAction(
                          icon: Icons.map_outlined,
                          onPressed: () => _openRouteModal(latestRoute!),
                          color: Colors.orange.shade600,
                        ),
                      ],
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

class _AgentTab extends StatelessWidget {
  const _AgentTab({
    required this.label,
    required this.isSelected,
    required this.onPressed,
  });

  final String label;
  final bool isSelected;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onPressed,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? AppConstants.primaryColor : Colors.grey.shade100,
          borderRadius: BorderRadius.circular(12),
          boxShadow: isSelected
              ? [
                  BoxShadow(
                    color: AppConstants.primaryColor.withOpacity(0.3),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  )
                ]
              : null,
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w900,
            letterSpacing: 0.5,
            color: isSelected ? Colors.white : Colors.grey.shade600,
          ),
        ),
      ),
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
class _PremiumToast extends StatefulWidget {
  const _PremiumToast({required this.message, required this.onDismiss});
  final String message;
  final VoidCallback onDismiss;

  @override
  State<_PremiumToast> createState() => _PremiumToastState();
}

class _PremiumToastState extends State<_PremiumToast> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _opacity;
  late Animation<Offset> _offset;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 400),
    );
    _opacity = CurvedAnimation(parent: _controller, curve: Curves.easeIn);
    _offset = Tween<Offset>(begin: const Offset(0, -1), end: Offset.zero).animate(
      CurvedAnimation(parent: _controller, curve: Curves.elasticOut),
    );
    _controller.forward();
    
    Future.delayed(const Duration(milliseconds: 2600), () {
      if (mounted) _controller.reverse();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: MediaQuery.of(context).padding.top + 80,
      left: 20,
      right: 20,
      child: FadeTransition(
        opacity: _opacity,
        child: SlideTransition(
          position: _offset,
          child: Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    AppConstants.secondaryColor,
                    AppConstants.secondaryColor.withOpacity(0.8),
                  ],
                ),
                borderRadius: BorderRadius.circular(30),
                boxShadow: [
                  BoxShadow(
                    color: AppConstants.secondaryColor.withOpacity(0.3),
                    blurRadius: 15,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.auto_awesome_rounded, color: Colors.amberAccent, size: 18),
                  const SizedBox(width: 12),
                  Flexible(
                    child: Material(
                      color: Colors.transparent,
                      child: Text(
                        widget.message,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 0.3,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
