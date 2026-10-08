import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_web_plugins/url_strategy.dart' show usePathUrlStrategy;
import 'package:sentry_flutter/sentry_flutter.dart';
import 'core/theme/aera_theme.dart';
import 'core/router/app_router.dart';
import 'core/config/app_config.dart';
import 'core/observability/sentry_bootstrap.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Phase 5: Use path URL strategy for web builds so customer-facing links
  // work correctly with static hosting (e.g., Cloudflare Pages) and SPA fallback.
  usePathUrlStrategy();
  
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
    ),
  );

  bootstrapWithSentry(() {
    // The ProviderScope lives above the app so the router (which reads the
    // auth state) and every screen share one provider container.
    const app = ProviderScope(child: AeraApp());

    // Only wrap in SentryWidget when Sentry is enabled
    runApp(AppConfig.isSentryEnabled ? SentryWidget(child: app) : app);
  });
}

class AeraApp extends ConsumerWidget {
  const AeraApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'Aera Field Operations',
      debugShowCheckedModeBanner: false,
      theme: AeraTheme.lightTheme,
      routerConfig: router,
    );
  }
}
