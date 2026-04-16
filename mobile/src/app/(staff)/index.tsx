import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ImageBackground } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export default function StaffDashboard() {
  const insets = useSafeAreaInsets();

  return (
    <View style={s.root}>
      {/* Top Header Background Glow */}
      <View style={s.topGlow} />

      <ScrollView contentContainerStyle={[s.scrollContent, { paddingTop: insets.top + 20, paddingBottom: 100 }]} showsVerticalScrollIndicator={false}>
        
        {/* Top App Bar Profile */}
        <View style={s.appBar}>
          <View>
            <Text style={s.portalTitle}>DETAIL PORTAL</Text>
            <View style={s.statusRow}>
              <View style={s.onlineDot} />
              <Text style={s.statusText}>On Duty</Text>
            </View>
          </View>
          <View style={s.profilePicContainer}>
            <MaterialIcons name="person" size={24} color="#FFF" />
          </View>
        </View>

        {/* Hero Section */}
        <View style={s.heroSection}>
          <Text style={s.greeting}>Good morning, Alex.</Text>
          <Text style={s.subtitle}>You have 4 detailing appointments scheduled for today.</Text>
          <TouchableOpacity style={s.clockInBtn} activeOpacity={0.8}>
            <MaterialIcons name="add" size={18} color="#000" />
            <Text style={s.clockInText}>Clock In</Text>
          </TouchableOpacity>
        </View>

        {/* KPI Bento Grid */}
        <View style={s.kpiGrid}>
          {/* KPI 1 */}
          <View style={[s.kpiCard, { marginRight: 8 }]}>
            <View style={s.progressRingContainer}>
              <View style={s.progressRingActive} />
              <View style={s.progressRingTrack} />
              <Text style={s.progressValue}>75%</Text>
            </View>
            <Text style={s.kpiLabel}>CARS COMPLETED</Text>
            <Text style={s.kpiStat}>3 / 4</Text>
          </View>
          
          {/* KPI 2 */}
          <View style={[s.kpiCard, { marginLeft: 8 }]}>
            <View style={s.iconContainerCircle}>
              <MaterialIcons name="inventory-2" size={28} color="#FFB77D" />
            </View>
            <Text style={s.kpiLabel}>SUPPLIES LOGGED</Text>
            <Text style={s.kpiStat}>85<Text style={s.kpiStatSub}>%</Text></Text>
          </View>
        </View>

        {/* Today's Job Queue */}
        <View style={s.sectionContainer}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Today's Appointment Queue</Text>
            <TouchableOpacity><Text style={s.viewAllBtn}>View All</Text></TouchableOpacity>
          </View>

          {/* Job 1 (Completed) */}
          <View style={s.jobCard}>
            <View style={s.jobTimeCol}>
              <Text style={s.jobTimeText}>08:00</Text>
              <Text style={s.jobTimePeriod}>AM</Text>
            </View>
            <View style={s.jobDetails}>
              <Text style={s.jobName}>Full Exterior Valet</Text>
              <View style={s.jobLocationRow}>
                <MaterialIcons name="directions-car" size={14} color="#888" />
                <Text style={s.jobLocationText}>BMW M3 - The Harrison Residence</Text>
              </View>
            </View>
            <View style={s.jobStatusWrapper}>
              <View style={[s.jobStatusBadge, { backgroundColor: 'rgba(34, 197, 94, 0.15)' }]}>
                <Text style={[s.jobStatusText, { color: '#4ADE80' }]}>DONE</Text>
              </View>
            </View>
          </View>

          {/* Job 2 (Current) */}
          <View style={[s.jobCard, s.jobCardCurrent]}>
            <View style={s.currentGlow} />
            <View style={s.currentStripe} />
            <View style={s.jobTimeCol}>
              <Text style={[s.jobTimeText, { color: '#FFF' }]}>10:30</Text>
              <Text style={[s.jobTimePeriod, { color: '#CCC' }]}>AM</Text>
            </View>
            <View style={s.jobDetails}>
              <Text style={[s.jobName, { color: '#FFF' }]}>Ceramic Coating App</Text>
              <View style={s.jobLocationRow}>
                <MaterialIcons name="directions-car" size={14} color="#FFB77D" />
                <Text style={[s.jobLocationText, { color: '#FFB77D' }]}>Tesla Model S - In-Shop</Text>
              </View>
            </View>
            <View style={s.jobStatusWrapper}>
              <View style={[s.jobStatusBadge, { backgroundColor: 'rgba(255, 183, 125, 0.2)' }]}>
                <Text style={[s.jobStatusText, { color: '#FFB77D' }]}>IN-PROGRESS</Text>
              </View>
            </View>
          </View>

          {/* Job 3 (Upcoming) */}
          <View style={s.jobCard}>
            <View style={s.jobTimeCol}>
              <Text style={s.jobTimeTextDim}>03:00</Text>
              <Text style={s.jobTimePeriodDim}>PM</Text>
            </View>
            <View style={s.jobDetails}>
              <Text style={s.jobNameDim}>Premium Interior Detail</Text>
              <View style={s.jobLocationRow}>
                <MaterialIcons name="directions-car" size={14} color="#555" />
                <Text style={s.jobLocationTextDim}>Range Rover - Sarah Jenkins</Text>
              </View>
            </View>
            <View style={s.jobStatusWrapper}>
              <View style={[s.jobStatusBadge, { backgroundColor: 'rgba(255, 255, 255, 0.05)' }]}>
                <Text style={[s.jobStatusText, { color: '#888' }]}>QUEUED</Text>
              </View>
            </View>
          </View>

        </View>

        {/* Visual Accent Card */}
        <View style={s.accentCardOutline}>
          <LinearGradient
            colors={['rgba(255, 140, 0, 0.8)', 'rgba(255, 183, 125, 0.1)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.accentCardContent}
          >
            <MaterialIcons name="science" size={32} color="#FFB77D" style={s.accentCardIcon} />
            <Text style={s.accentCardTag}>CHEMICAL SAFETY</Text>
            <Text style={s.accentCardTitle}>Always wear PPE when handling wheel acids & degreasers.</Text>
          </LinearGradient>
        </View>

        {/* Dispatch Feed */}
        <View style={s.sectionContainer}>
          <View style={s.sectionHeader}>
            <View style={s.rowCenter}>
              <Text style={s.sectionTitle}>Detailing Feed</Text>
              <View style={s.pulseDot} />
            </View>
          </View>

          {/* Feed Item 1 */}
          <View style={s.feedItem}>
            <View style={[s.feedIconWrap, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
              <MaterialIcons name="warning" size={16} color="#EF4444" />
            </View>
            <View style={s.feedContent}>
              <Text style={s.feedTitle}>Weather Warning</Text>
              <Text style={s.feedDesc}>Rain expected at 2 PM. Mobile jobs moving to covered bays.</Text>
              <Text style={s.feedTime}>5 mins ago</Text>
            </View>
          </View>

          {/* Feed Item 2 */}
          <View style={s.feedItem}>
            <View style={[s.feedIconWrap, { backgroundColor: 'rgba(255, 183, 125, 0.15)' }]}>
              <MaterialIcons name="inventory-2" size={16} color="#FFB77D" />
            </View>
            <View style={s.feedContent}>
              <Text style={s.feedTitle}>Low Stock: Wax</Text>
              <Text style={s.feedDesc}>Carnuba wax low in Van 4. Re-stock at shop by EOD.</Text>
              <Text style={s.feedTime}>1 hour ago</Text>
            </View>
          </View>

          {/* Feed Item 3 */}
          <View style={s.feedItem}>
            <View style={[s.feedIconWrap, { backgroundColor: 'rgba(255, 255, 255, 0.05)' }]}>
              <MaterialIcons name="check-circle" size={16} color="#888" />
            </View>
            <View style={s.feedContent}>
              <Text style={s.feedTitle}>Customer Confirmed</Text>
              <Text style={s.feedDesc}>Range Rover interior detail confirmed for 03:00 PM.</Text>
              <Text style={s.feedTime}>3 hours ago</Text>
            </View>
          </View>
        </View>

      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={s.fab} activeOpacity={0.9}>
        <LinearGradient
          colors={['#FFB77D', '#FF8C00']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.fabGradient}
        >
          <MaterialIcons name="camera-alt" size={24} color="#0E0E0E" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0E0E0E',
  },
  topGlow: {
    position: 'absolute',
    top: -100,
    left: -50,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#FF8C00',
    opacity: 0.1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  portalTitle: {
    color: '#FFB77D',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    fontFamily: 'Inter',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ADE80',
    marginRight: 6,
  },
  statusText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
  },
  profilePicContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroSection: {
    marginBottom: 32,
  },
  greeting: {
    color: '#FFF',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 36,
    marginBottom: 8,
  },
  subtitle: {
    color: '#A1A1A1',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  clockInBtn: {
    backgroundColor: '#FFB77D',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  clockInText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 14,
    marginLeft: 6,
  },
  kpiGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  progressRingContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  progressRingActive: {
    position: 'absolute',
    borderTopColor: '#FFB77D',
    borderRightColor: '#FFB77D',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
    borderWidth: 4,
    borderRadius: 32,
    width: 64,
    height: 64,
    transform: [{ rotate: '45deg' }],
  },
  progressRingTrack: {
    position: 'absolute',
  },
  progressValue: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  iconContainerCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 183, 125, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  kpiLabel: {
    color: '#666',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  kpiStat: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '800',
  },
  kpiStatSub: {
    fontSize: 14,
    color: '#888',
  },
  sectionContainer: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
  },
  viewAllBtn: {
    color: '#FFB77D',
    fontSize: 12,
    fontWeight: '700',
  },
  jobCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151515',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  jobCardCurrent: {
    backgroundColor: '#1A1A1A',
    borderColor: 'rgba(255, 183, 125, 0.3)',
    borderWidth: 1,
    overflow: 'hidden',
  },
  currentStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#FFB77D',
  },
  currentGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 183, 125, 0.03)',
  },
  jobTimeCol: {
    alignItems: 'center',
    width: 50,
  },
  jobTimeText: {
    color: '#CCC',
    fontSize: 14,
    fontWeight: '800',
  },
  jobTimePeriod: {
    color: '#888',
    fontSize: 10,
    fontWeight: '700',
  },
  jobTimeTextDim: {
    color: '#666',
    fontSize: 14,
    fontWeight: '800',
  },
  jobTimePeriodDim: {
    color: '#555',
    fontSize: 10,
    fontWeight: '700',
  },
  jobDetails: {
    flex: 1,
    paddingLeft: 12,
  },
  jobName: {
    color: '#E0E0E0',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  jobNameDim: {
    color: '#888',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  jobLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  jobLocationText: {
    color: '#888',
    fontSize: 12,
    marginLeft: 4,
  },
  jobLocationTextDim: {
    color: '#555',
    fontSize: 12,
    marginLeft: 4,
  },
  jobStatusWrapper: {
    marginLeft: 8,
  },
  jobStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  jobStatusText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  accentCardOutline: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 183, 125, 0.1)',
    overflow: 'hidden',
    marginBottom: 32,
  },
  accentCardContent: {
    padding: 24,
  },
  accentCardIcon: {
    marginBottom: 16,
    opacity: 0.8,
  },
  accentCardTag: {
    color: '#FFB77D',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 8,
  },
  accentCardTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
    marginLeft: 8,
  },
  feedItem: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  feedIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  feedContent: {
    flex: 1,
  },
  feedTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  feedDesc: {
    color: '#999',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
  feedTime: {
    color: '#666',
    fontSize: 10,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    bottom: 100, // accommodate bottom tab bar
    right: 20,
    shadowColor: '#FF8C00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  }
});
