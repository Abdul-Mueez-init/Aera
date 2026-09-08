import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'core/theme/aera_theme.dart';
import 'core/router/app_router.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
    ),
  );
  runApp(const AeraApp());
}

class AeraApp extends StatelessWidget {
  const AeraApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Aera Field Operations',
      debugShowCheckedModeBanner: false,
      theme: AeraTheme.lightTheme,
      routerConfig: appRouter,
    );
  }
}
