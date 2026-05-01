import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'screens/voice_home_page.dart';
import 'utils/constants.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Set status bar to transparent
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.dark,
  ));

  runApp(const VoiceApp());
}

class VoiceApp extends StatelessWidget {
  const VoiceApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'DATN Chatbot',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppConstants.primaryColor,
          primary: AppConstants.primaryColor,
        ),
        fontFamily: 'Inter', // Defaulting to system font or Inter if added
        dialogTheme: DialogThemeData(
          backgroundColor: Colors.white,
          surfaceTintColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppConstants.borderRadius),
          ),
        ),
      ),
      home: const VoiceHomePage(),
    );
  }
}
