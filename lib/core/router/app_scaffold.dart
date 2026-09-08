import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme/aera_colors.dart';
import '../theme/aera_typography.dart';
import '../widgets/aera_bottom_nav.dart';

class AppScaffold extends StatelessWidget {
  const AppScaffold({
    super.key,
    required this.navigationShell,
  });

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: AeraBottomNav(
        currentIndex: navigationShell.currentIndex,
        onTap: (index) {
          navigationShell.goBranch(
            index,
            initialLocation: index == navigationShell.currentIndex,
          );
        },
      ),
      endDrawer: const _ScreenCatalogDrawer(),
    );
  }
}

class _ScreenCatalogDrawer extends StatelessWidget {
  const _ScreenCatalogDrawer();

  @override
  Widget build(BuildContext context) {
    return Drawer(
      backgroundColor: AeraColors.canvas,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  const Icon(Icons.apps, color: AeraColors.accent),
                  const SizedBox(width: 10),
                  Text(
                    'Screen Catalog (34)',
                    style: AeraTypography.h3.copyWith(fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            ),
            const Divider(color: AeraColors.line),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                children: [
                  _categoryHeader('Batch 1: Auth & Onboarding'),
                  _item(context, 'Splash', '/splash'),
                  _item(context, 'Welcome / Intro', '/welcome'),
                  _item(context, 'Login', '/login'),
                  _item(context, 'Sign Up', '/sign-up'),
                  _item(context, 'Forgot Password', '/forgot-password'),
                  _item(context, 'Reset Password', '/reset-password'),
                  _item(context, 'Business Basics', '/onboarding/business-basics'),
                  _item(context, 'Service Area', '/onboarding/service-area'),
                  _item(context, 'Services', '/onboarding/services'),
                  _item(context, 'Team Setup', '/onboarding/team-setup'),
                  _item(context, 'Onboarding Complete', '/onboarding/complete'),

                  _categoryHeader('Batch 2: Dispatcher & Core'),
                  _item(context, 'Dashboard', '/dashboard'),
                  _item(context, 'Jobs', '/jobs'),
                  _item(context, 'Job Detail', '/jobs/JOB-4019'),
                  _item(context, 'Calendar / Schedule', '/calendar'),
                  _item(context, 'Customers', '/customers'),
                  _item(context, 'Customer Detail', '/customers/CUST-1002'),

                  _categoryHeader('Batch 3: Creation & Scheduling'),
                  _item(context, 'Create Customer', '/create-customer'),
                  _item(context, 'Create Job', '/create-job'),
                  _item(context, 'Schedule Job', '/schedule-job'),
                  _item(context, 'Create Quote', '/create-quote'),
                  _item(context, 'Create Invoice', '/create-invoice'),

                  _categoryHeader('Batch 4: Commercial & Portals'),
                  _item(context, 'Quotes Directory', '/quotes'),
                  _item(context, 'Quote Detail', '/quotes/QTE-0021'),
                  _item(context, 'Invoices Directory', '/invoices'),
                  _item(context, 'Quote Approval (Client)', '/quote-approval'),
                  _item(context, 'Invoice Payment (Client)', '/invoice-payment'),

                  _categoryHeader('Batch 5: Field, AI & Settings'),
                  _item(context, 'Technician Tracking', '/technician-tracking'),
                  _item(context, 'AI Operations Assistant', '/ai-assistant'),
                  _item(context, 'AI Insight Detail', '/ai-insight/ins-1'),
                  _item(context, 'Notifications', '/notifications'),
                  _item(context, 'Profile Settings', '/profile-settings'),
                  _item(context, 'Company Settings', '/company-settings'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _categoryHeader(String title) {
    return Padding(
      padding: const EdgeInsets.only(top: 16, bottom: 6, left: 8),
      child: Text(
        title.toUpperCase(),
        style: AeraTypography.labelUpper.copyWith(
          color: AeraColors.accent,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }

  Widget _item(BuildContext context, String title, String path) {
    return ListTile(
      dense: true,
      visualDensity: VisualDensity.compact,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      title: Text(
        title,
        style: AeraTypography.bodySm.copyWith(
          color: AeraColors.ink,
          fontWeight: FontWeight.w500,
        ),
      ),
      trailing: const Icon(Icons.arrow_forward_ios, size: 12, color: AeraColors.outline),
      onTap: () {
        Navigator.of(context).pop(); // close drawer
        context.push(path);
      },
    );
  }
}
