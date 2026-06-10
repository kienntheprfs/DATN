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
  String selectedAgent = 'router-agent';
  bool _isLoading = false;
  List<AgentInfo> agents = [
    AgentInfo(key: 'router-agent'),
    AgentInfo(key: 'knowledge-base-agent'),
    AgentInfo(key: 'map-assistant'),
  ];
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
        if (!agents.any((a) => a.key == selectedAgent)) {
          if (agents.any((a) => a.key == 'router-agent')) {
            selectedAgent = 'router-agent';
          } else if (agents.any((a) => a.key == 'knowledge-base-agent')) {
            selectedAgent = 'knowledge-base-agent';
          } else if (agents.any((a) => a.key == 'map-assistant')) {
            selectedAgent = 'map-assistant';
          } else if (agents.isNotEmpty) {
            selectedAgent = agents.first.key;
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

  String _getAgentDisplayName(String agentKey) {
    final match = agents.where((a) => a.key == agentKey);
    return match.isNotEmpty ? match.first.displayName : agentKey;
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
                  // Left section: status + agent
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _StatusIndicator(status: voice.status),
                      const SizedBox(width: 8),
                      PopupMenuButton<String>(
                        onSelected: _switchAgent,
                        offset: const Offset(0, 4),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        elevation: 4,
                        itemBuilder: (context) {
                          final items = <PopupMenuEntry<String>>[];
                          items.add(
                            PopupMenuItem<String>(
                              enabled: false,
                              child: Padding(
                                padding: const EdgeInsets.only(bottom: 2),
                                child: Text(
                                  'Chọn Agent hoạt động',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                    color: Colors.grey.shade600,
                                  ),
                                ),
                              ),
                            ),
                          );
                          items.add(const PopupMenuDivider(height: 1));
                          for (final a in agents) {
                            final isSel = selectedAgent == a.key;
                            items.add(
                              PopupMenuItem<String>(
                                value: a.key,
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            a.displayName,
                                            style: TextStyle(
                                              fontWeight: FontWeight.bold,
                                              fontSize: 13,
                                              color: isSel ? AppConstants.primaryColor : Colors.black87,
                                            ),
                                          ),
                                          if (a.description != null && a.description!.isNotEmpty)
                                            Text(
                                              a.description!,
                                              style: TextStyle(
                                                fontSize: 10,
                                                color: Colors.grey.shade500,
                                              ),
                                              maxLines: 2,
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                        ],
                                      ),
                                    ),
                                    if (isSel)
                                      Container(
                                        width: 6,
                                        height: 6,
                                        decoration: BoxDecoration(
                                          color: AppConstants.primaryColor,
                                          shape: BoxShape.circle,
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            );
                          }
                          return items;
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: Colors.grey.shade100,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: Colors.grey.shade200),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.settings, size: 13, color: AppConstants.secondaryColor),
                              const SizedBox(width: 4),
                              Text(
                                'Agent:',
                                style: TextStyle(
                                  fontSize: 11,
                                  color: Colors.grey.shade600,
                                ),
                              ),
                              const SizedBox(width: 3),
                              Text(
                                _getAgentDisplayName(selectedAgent),
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w800,
                                  color: AppConstants.primaryColor,
                                ),
                              ),
                              const SizedBox(width: 2),
                              Icon(Icons.arrow_drop_down, size: 16, color: Colors.grey.shade600),
                            ],
                          ),
                        ),
                      ),
                      if (voice.status == VoiceStatus.connected)
                        _VoiceWaveform(micLevel: voice.micLevel),
                    ],
                  ),
                  const Spacer(),
                  // Right section: call, mic toggle, history, logout, close
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Call button
                      GestureDetector(
                        onTap: connecting ? null : _toggleVoice,
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 250),
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(24),
                            color: connected
                                ? AppConstants.errorColor
                                : AppConstants.primaryColor,
                            boxShadow: [
                              BoxShadow(
                                color: (connected
                                        ? AppConstants.errorColor
                                        : AppConstants.primaryColor)
                                    .withOpacity(0.3),
                                blurRadius: 8,
                              ),
                            ],
                          ),
                          child: connecting
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2.5,
                                    color: Colors.white,
                                  ),
                                )
                              : Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(
                                      connected
                                          ? Icons.call_end_rounded
                                          : Icons.mic_rounded,
                                      color: Colors.white,
                                      size: 18,
                                    ),
                                    const SizedBox(width: 6),
                                    Text(
                                      connected ? 'Ngắt' : 'Kết nối',
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ),
                        ),
                      ),
                      if (connected)
                        Padding(
                          padding: const EdgeInsets.only(left: 4),
                          child: GestureDetector(
                            onTap: voice.toggleMute,
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 200),
                              width: 36,
                              height: 36,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: voice.isMuted
                                    ? AppConstants.errorColor.withOpacity(0.1)
                                    : AppConstants.primaryColor.withOpacity(0.1),
                                border: Border.all(
                                  color: voice.isMuted
                                      ? AppConstants.errorColor
                                      : AppConstants.primaryColor,
                                  width: 1.5,
                                ),
                              ),
                              child: Icon(
                                voice.isMuted
                                    ? Icons.mic_off_rounded
                                    : Icons.mic_rounded,
                                color: voice.isMuted
                                    ? AppConstants.errorColor
                                    : AppConstants.primaryColor,
                                size: 18,
                              ),
                            ),
                          ),
                        ),
                      // Rating star
                      if (voice.runId != null)
                        _RatingStar(
                          token: token,
                          runId: voice.runId!,
                          threadId: voice.threadId ?? '',
                          agentId: selectedAgent,
                          api: api,
                        ),
                      const SizedBox(width: 4),
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
                ],
              ),
            ),
          ),

          // Bottom Controls and Transcript
          Positioned(
            left: 20,
            right: 20,
            bottom: MediaQuery.of(context).padding.bottom + 20,
            child: (voice.transcriptHistory.isNotEmpty || voice.currentTranscript.isNotEmpty)
                ? Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      // Transcript
                      Expanded(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
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
                      ),
                      // Action buttons bên phải
                      if (latestConfirmationJson != null || latestLandmarks != null || latestRoute != null)
                        Padding(
                          padding: const EdgeInsets.only(left: 12),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (latestConfirmationJson != null)
                                _SmallAction(
                                  icon: Icons.navigation_rounded,
                                  onPressed: () => _openConfirmationDialog(latestConfirmationJson!),
                                  color: Colors.purple.shade600,
                                ),
                              if (latestConfirmationJson != null && latestLandmarks != null)
                                const SizedBox(height: 8),
                              if (latestLandmarks != null)
                                _SmallAction(
                                  icon: Icons.image_search_rounded,
                                  onPressed: () => _openLandmarkModal(latestLandmarks!),
                                  color: Colors.blue.shade600,
                                ),
                              if ((latestConfirmationJson != null || latestLandmarks != null) && latestRoute != null)
                                const SizedBox(height: 8),
                              if (latestRoute != null)
                                _SmallAction(
                                  icon: Icons.map_outlined,
                                  onPressed: () => _openRouteModal(latestRoute!),
                                  color: Colors.orange.shade600,
                                ),
                            ],
                          ),
                        ),
                    ],
                  )
                : const SizedBox.shrink(),
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

class _VoiceWaveform extends StatelessWidget {
  const _VoiceWaveform({required this.micLevel});
  final double micLevel;

  static const List<double> _factors = [
    0.3, 0.7, 0.5, 1.0, 0.8,
    0.9, 0.4, 0.6, 0.2, 0.7,
  ];

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 10),
      child: SizedBox(
        height: 24,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: List.generate(10, (i) {
            final active = micLevel > 0.01;
            final height = active
                ? (4.0 + (micLevel * 20.0 * _factors[i])).clamp(4.0, 24.0)
                : 4.0;
            return Container(
              width: 3,
              height: height,
              margin: const EdgeInsets.symmetric(horizontal: 1.5),
              decoration: BoxDecoration(
                color: active
                    ? AppConstants.primaryColor
                    : Colors.grey.shade400,
                borderRadius: BorderRadius.circular(10),
              ),
            );
          }),
        ),
      ),
    );
  }
}


class _SmallAction extends StatelessWidget {
  const _SmallAction({
    required this.icon,
    required this.onPressed,
    required this.color,
  });

  final IconData icon;
  final VoidCallback onPressed;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onPressed,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: color.withOpacity(0.1),
          border: Border.all(color: color.withOpacity(0.3), width: 1.5),
        ),
        child: Icon(icon, color: color, size: 22),
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

class _RatingStar extends StatefulWidget {
  const _RatingStar({
    required this.token,
    required this.runId,
    required this.threadId,
    required this.agentId,
    required this.api,
  });

  final String? token;
  final String runId;
  final String threadId;
  final String agentId;
  final ApiClient api;

  @override
  State<_RatingStar> createState() => _RatingStarState();
}

class _RatingStarState extends State<_RatingStar> {
  Rating? _rated;

  void _showAuthRequired() {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Vui lòng đăng nhập để đánh giá')),
    );
  }

  Future<void> _handleLike() async {
    if (_rated == Rating.like) return;
    if (widget.token == null) { _showAuthRequired(); return; }
    try {
      await widget.api.submitRating(
        token: widget.token!,
        runId: widget.runId,
        threadId: widget.threadId,
        agentId: widget.agentId,
        rating: Rating.like,
      );
      if (mounted) setState(() => _rated = Rating.like);
    } catch (_) {}
  }

  Future<void> _handleDislike() async {
    if (_rated == Rating.dislike) return;
    if (widget.token == null) { _showAuthRequired(); return; }
    final result = await showDialog<String>(
      context: context,
      builder: (_) => _DislikeDialog(),
    );
    if (result == null) return;
    try {
      await widget.api.submitRating(
        token: widget.token!,
        runId: widget.runId,
        threadId: widget.threadId,
        agentId: widget.agentId,
        rating: Rating.dislike,
        comment: result,
      );
      if (mounted) setState(() => _rated = Rating.dislike);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<Rating>(
      onSelected: (rating) {
        if (rating == Rating.like) {
          _handleLike();
        } else {
          _handleDislike();
        }
      },
      offset: const Offset(0, 40),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      color: Colors.white,
      elevation: 4,
      itemBuilder: (context) => [
        PopupMenuItem(
          value: Rating.like,
          child: Row(
            children: [
              Icon(Icons.thumb_up_rounded, size: 18, color: _rated == Rating.like ? Colors.green.shade600 : Colors.grey),
              const SizedBox(width: 8),
              Text(
                _rated == Rating.like ? 'Đã thích' : 'Thích',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: _rated == Rating.like ? FontWeight.w700 : FontWeight.w500,
                  color: _rated == Rating.like ? Colors.green.shade700 : Colors.black87,
                ),
              ),
              if (_rated == Rating.like)
                const Padding(
                  padding: EdgeInsets.only(left: 4),
                  child: Icon(Icons.check, size: 16, color: Colors.green),
                ),
            ],
          ),
        ),
        PopupMenuItem(
          value: Rating.dislike,
          child: Row(
            children: [
              Icon(Icons.thumb_down_rounded, size: 18, color: _rated == Rating.dislike ? Colors.orange.shade600 : Colors.grey),
              const SizedBox(width: 8),
              Text(
                _rated == Rating.dislike ? 'Đã không thích' : 'Không thích',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: _rated == Rating.dislike ? FontWeight.w700 : FontWeight.w500,
                  color: _rated == Rating.dislike ? Colors.orange.shade700 : Colors.black87,
                ),
              ),
              if (_rated == Rating.dislike)
                const Padding(
                  padding: EdgeInsets.only(left: 4),
                  child: Icon(Icons.check, size: 16, color: Colors.orange),
                ),
            ],
          ),
        ),
      ],
      child: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: _rated != null ? Colors.amber.withOpacity(0.15) : Colors.transparent,
        ),
        child: Icon(
          _rated != null ? Icons.star_rounded : Icons.star_outline_rounded,
          size: 18,
          color: _rated != null ? Colors.amber.shade600 : AppConstants.secondaryColor,
        ),
      ),
    );
  }
}

class _DislikeDialog extends StatefulWidget {
  const _DislikeDialog();

  @override
  State<_DislikeDialog> createState() => _DislikeDialogState();
}

class _DislikeDialogState extends State<_DislikeDialog> {
  final _tags = [
    'Thông tin sai',
    'Không rõ ràng',
    'Chưa đầy đủ',
    'Quá dài',
    'Không liên quan',
    'Khác',
  ];
  final Set<String> _selectedTags = {};
  final _commentController = TextEditingController();

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final comment = _selectedTags.join(', ') +
        (_commentController.text.isNotEmpty
            ? '. ${_commentController.text}'
            : '');

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Phản hồi về câu trả lời',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 16),
            const Text(
              'Chọn lý do (tùy chọn)',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _tags.map((tag) {
                final isSelected = _selectedTags.contains(tag);
                return GestureDetector(
                  onTap: () => setState(() {
                    if (isSelected) {
                      _selectedTags.remove(tag);
                    } else {
                      _selectedTags.add(tag);
                    }
                  }),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? AppConstants.primaryColor
                          : Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: isSelected
                            ? AppConstants.primaryColor
                            : Colors.grey.shade300,
                      ),
                    ),
                    child: Text(
                      tag,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: isSelected ? Colors.white : Colors.black87,
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 16),
            const Text(
              'Nhận xét thêm',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _commentController,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: 'Nhập nhận xét của bạn...',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                contentPadding: const EdgeInsets.all(12),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Hủy'),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: () => Navigator.pop(context, comment),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppConstants.primaryColor,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: const Text('Gửi phản hồi'),
                ),
              ],
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
