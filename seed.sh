#!/usr/bin/env bash
# Seeds campus buildings (A–I), classrooms, academic faculties,
# course offerings, class schedules, demo students, and enrollments via psql.
# Idempotent (ON CONFLICT DO UPDATE); assumes schema tables already exist.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Fall back to .env.local or .env when DATABASE_URL is not set in the environment
if [[ -z "${DATABASE_URL:-}" ]]; then
	for env_file in "$SCRIPT_DIR/.env.local" "$SCRIPT_DIR/.env"; do
		if [[ -f "$env_file" ]]; then
			raw_line="$(grep -E '^[[:space:]]*(export[[:space:]]+)?DATABASE_URL=' "$env_file" | tail -n 1 || true)"
			if [[ -n "$raw_line" ]]; then
				val="${raw_line#*=}"
				val="${val#"${val%%[![:space:]]*}"}"
				val="${val%"${val##*[![:space:]]}"}"
				if [[ "$val" == \"*\" && "$val" == *\" ]]; then
					val="${val:1:${#val}-2}"
				elif [[ "$val" == \'*\' && "$val" == *\' ]]; then
					val="${val:1:${#val}-2}"
				fi
				if [[ -n "$val" ]]; then
					DATABASE_URL="$val"
					break
				fi
			fi
		fi
	done
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
	echo "Error: DATABASE_URL is not set." >&2
	exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
	echo "Error: psql is not installed or not in PATH." >&2
	exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --no-psqlrc --quiet <<'SQL'
BEGIN;

-- 1. Seed Campus Buildings (A–I)
INSERT INTO buildings (code, name, purpose, has_classes, total_floors)
VALUES
	('A', 'Gedung A', 'Perpustakaan', false, 2),
	('B', 'Gedung B', 'Fakultas Ilmu Budaya', true, 4),
	('C', 'Gedung C', 'Fakultas Ekonomi dan Bisnis', true, 5),
	('D', 'Gedung D', 'Labs', true, 4),
	('E', 'Gedung E', 'Auditorium', false, 4),
	('F', 'Gedung F', 'Unit Kegiatan Mahasiswa (UKM) & Student Center', false, 2),
	('G', 'Gedung G', 'Biro Keuangan, Biro Akademik, dan Mahasiswa Internasional', true, 3),
	('H', 'Gedung H', 'Fakultas Ilmu Komputer, Tata Usaha, dan Ruang Dosen', true, 6),
	('I', 'Gedung I', 'Fakultas Teknik Elektro, Teknik Biomedis, dan Teknik Industri', true, 5)
ON CONFLICT (code) DO UPDATE SET
	name = EXCLUDED.name,
	purpose = EXCLUDED.purpose,
	has_classes = EXCLUDED.has_classes,
	total_floors = EXCLUDED.total_floors;

-- 2. Seed Classrooms & Laboratories (5 rooms per floor in class-enabled buildings)
INSERT INTO rooms (code, building_id, floor, room_number, name, capacity)
SELECT
	lower(b.code) || '.' || f.floor || '.' || r.room_num AS code,
	b.id AS building_id,
	f.floor,
	r.room_num::text AS room_number,
	'Room ' || upper(b.code) || '.' || f.floor || '.' || r.room_num AS name,
	30 + f.floor * 10 AS capacity
FROM buildings b
CROSS JOIN LATERAL generate_series(1, b.total_floors) AS f(floor)
CROSS JOIN generate_series(1, 5) AS r(room_num)
WHERE b.code IN ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I')
	AND b.has_classes = true
ORDER BY b.code, f.floor, r.room_num
ON CONFLICT (code) DO UPDATE SET
	building_id = EXCLUDED.building_id,
	floor = EXCLUDED.floor,
	room_number = EXCLUDED.room_number,
	name = EXCLUDED.name,
	capacity = EXCLUDED.capacity;

-- 3. Seed Academic Faculties linked to their home buildings
INSERT INTO faculties (code, name, building_id)
SELECT
	v.code,
	v.name,
	b.id AS building_id
FROM (
	VALUES
		('FCS', 'Fakultas Ilmu Komputer', 'H'),
		('FEB', 'Fakultas Ekonomi dan Bisnis', 'C'),
		('FIB', 'Fakultas Ilmu Budaya', 'B'),
		('FTE', 'Fakultas Teknik Elektro', 'I'),
		('FBM', 'Fakultas Teknik Biomedis', 'I'),
		('FTI', 'Fakultas Teknik Industri', 'I')
) AS v(code, name, building_code)
INNER JOIN buildings b ON b.code = v.building_code
ON CONFLICT (code) DO UPDATE SET
	name = EXCLUDED.name,
	building_id = EXCLUDED.building_id;

-- 4. Seed Course Catalog (10 courses per faculty = 60 courses)
INSERT INTO courses (code, name, credits, description, faculty_id)
SELECT
	v.code,
	v.name,
	v.credits,
	v.description,
	f.id AS faculty_id
FROM (
	VALUES
		('FCS-101', 'Logika Informatika', 3, 'Introduction to logic and reasoning in computer science, including propositional and predicate logic, logical operators, and applications in programming.'),
		('FCS-102', 'Struktur Data dan Algoritma', 3, 'Study of data structures (arrays, linked lists, stacks, queues, trees, graphs) and algorithms (sorting, searching, recursion), with an emphasis on efficiency and complexity analysis.'),
		('FCS-103', 'Pemrograman Berbasis Objek', 3, 'Introduction to object-oriented programming concepts and practices, including classes, objects, inheritance, polymorphism, and encapsulation.'),
		('FCS-104', 'Basis Data', 3, 'Fundamentals of database systems, including relational databases, SQL, normalization, and database design principles.'),
		('FCS-105', 'Jaringan Komputer', 3, 'Study of computer networks, including network topologies, protocols, IP addressing, routing, and network security.'),
		('FCS-106', 'Sistem Operasi', 3, 'Introduction to operating systems, including process management, memory management, file systems, and device drivers.'),
		('FCS-107', 'Kecerdasan Buatan', 3, 'Introduction to artificial intelligence, including search algorithms, knowledge representation, machine learning, and natural language processing.'),
		('FCS-108', 'Keamanan Siber', 3, 'Study of cybersecurity principles, including cryptography, network security, ethical hacking, and security policies.'),
		('FCS-109', 'Pengembangan Aplikasi Web', 3, 'Introduction to web application development, including front-end and back-end technologies, frameworks, and best practices.'),
		('FCS-110', 'Pengolahan Citra', 3, 'Study of image processing techniques, including filtering, enhancement, segmentation, and feature extraction.'),
		('FEB-101', 'Pengantar Ekonomi', 3, 'Introduction to economic principles, including supply and demand, market structures, and economic policy.'),
		('FEB-102', 'Manajemen Pemasaran', 3, 'Study of marketing management principles, including market research, consumer behavior, and marketing strategies.'),
		('FEB-103', 'Akuntansi', 3, 'Introduction to accounting principles, including financial statements, accounting cycle, and cost accounting.'),
		('FEB-104', 'Keuangan Perusahaan', 3, 'Study of corporate finance principles, including capital budgeting, financial analysis, and risk management.'),
		('FEB-105', 'Manajemen Operasi', 3, 'Introduction to operations management, including production planning, quality control, and supply chain management.'),
		('FEB-106', 'Perilaku Organisasi', 3, 'Study of organizational behavior principles, including motivation, leadership, team dynamics, and organizational culture.'),
		('FEB-107', 'Manajemen Sumber Daya Manusia', 3, 'Introduction to human resource management principles, including recruitment, training, performance appraisal, and employee relations.'),
		('FEB-108', 'Pengantar Bisnis', 3, 'Introduction to business principles, including entrepreneurship, strategic planning, and business ethics.'),
		('FEB-109', 'Manajemen Proyek', 3, 'Study of project management principles, including project planning, scheduling, budgeting, and risk management.'),
		('FEB-110', 'Analisis Keuangan', 3, 'Introduction to financial analysis techniques, including ratio analysis, cash flow analysis, and financial forecasting.'),
		('FIB-101', 'Bahasa Inggris Akademik', 3, 'Introduction to academic English skills, including reading, writing, listening, and speaking for academic purposes.'),
		('FIB-102', 'Bahasa Indonesia Lanjutan', 3, 'Advanced study of the Indonesian language, including grammar, vocabulary, and writing skills.'),
		('FIB-103', 'Sastra Dunia', 3, 'Study of world literature, including literary analysis, cultural context, and comparative literature.'),
		('FIB-104', 'Linguistik', 3, 'Introduction to linguistics principles, including phonetics, syntax, semantics, and sociolinguistics.'),
		('FIB-105', 'Terjemahan', 3, 'Study of translation techniques and practices, including translation theory, methods, and applications.'),
		('FIB-106', 'Budaya dan Masyarakat', 3, 'Study of culture and society, including cultural analysis, social structures, and cultural diversity.'),
		('FIB-107', 'Sejarah dan Peradaban', 3, 'Introduction to history and civilization, including historical analysis, historiography, and cultural heritage.'),
		('FIB-108', 'Sastra Indonesia', 3, 'Study of Indonesian literature, including literary analysis, cultural context, and literary history.'),
		('FIB-109', 'Bahasa Asing Lainnya', 3, 'Study of other foreign languages, including grammar, vocabulary, and communication skills.'),
		('FIB-110', 'Kritik Sastra', 3, 'Study of literary criticism principles, including critical theory, literary analysis, and interpretation.'),
		('FTE-101', 'Dasar-dasar Teknik Elektro', 3, 'Introduction to electrical engineering principles, including circuit analysis, electrical components, and basic electronics.'),
		('FTE-102', 'Sistem Tenaga Listrik', 3, 'Study of electrical power systems, including generation, transmission, distribution, and power system analysis.'),
		('FTE-103', 'Elektronika Analog', 3, 'Study of analog electronics principles, including amplifiers, filters, oscillators, and analog circuit design.'),
		('FTE-104', 'Elektronika Digital', 3, 'Study of digital electronics principles, including logic gates, flip-flops, counters, and digital circuit design.'),
		('FTE-105', 'Sistem Kontrol', 3, 'Introduction to control systems principles, including feedback control, stability analysis, and control system design.'),
		('FTE-106', 'Komunikasi Data', 3, 'Study of data communication principles, including data transmission, modulation techniques, and communication protocols.'),
		('FTE-107', 'Mikroprosesor dan Mikrokontroler', 3, 'Study of microprocessor and microcontroller principles, including architecture, programming, and interfacing.'),
		('FTE-108', 'Sistem Embedded', 3, 'Introduction to embedded systems principles, including embedded hardware, software development, and real-time operating systems.'),
		('FTE-109', 'Instrumentasi dan Pengukuran', 3, 'Study of instrumentation and measurement techniques, including sensors, transducers, and data acquisition systems.'),
		('FTE-110', 'Energi Terbarukan', 3, 'Study of renewable energy principles, including solar, wind, hydro, and bioenergy systems.'),
		('FBM-101', 'Dasar-dasar Teknik Biomedis', 3, 'Introduction to biomedical engineering principles, including medical devices, biomaterials, and biomedical instrumentation.'),
		('FBM-102', 'Sistem Biomedis', 3, 'Study of biomedical systems, including physiological systems, biomedical signal processing, and medical imaging.'),
		('FBM-103', 'Biomaterial dan Biomekanika', 3, 'Study of biomaterials and biomechanics principles, including material properties, tissue engineering, and biomechanical analysis.'),
		('FBM-104', 'Elektronika Biomedis', 3, 'Study of biomedical electronics principles, including biomedical sensors, signal conditioning, and biomedical circuit design.'),
		('FBM-105', 'Pengolahan Sinyal Biomedis', 3, 'Study of biomedical signal processing techniques, including filtering, feature extraction, and pattern recognition.'),
		('FBM-106', 'Sistem Informasi Kesehatan', 3, 'Introduction to health information systems principles, including electronic health records, health data management, and health informatics.'),
		('FBM-107', 'Rekayasa Jaringan Saraf', 3, 'Study of neural network engineering principles, including artificial neural networks, deep learning, and applications in biomedical engineering.'),
		('FBM-108', 'Robotika Medis', 3, 'Study of medical robotics principles, including robotic surgery, rehabilitation robotics, and robotic assistive devices.'),
		('FBM-109', 'Sistem Biomedis Lanjut', 3, 'Advanced study of biomedical systems, including advanced medical imaging, biomedical signal analysis, and biomedical system design.'),
		('FBM-110', 'Etika dan Regulasi Biomedis', 3, 'Study of biomedical ethics and regulations, including ethical considerations in biomedical research, clinical trials, and regulatory compliance.'),
		('FTI-101', 'Dasar-dasar Teknik Industri', 3, 'Introduction to industrial engineering principles, including production systems, operations management, and industrial processes.'),
		('FTI-102', 'Manufaktur dan Produksi', 3, 'Study of manufacturing and production principles, including production planning, quality control, and lean manufacturing.'),
		('FTI-103', 'Manajemen Rantai Pasok', 3, 'Study of supply chain management principles, including logistics, inventory management, and supply chain optimization.'),
		('FTI-104', 'Analisis Sistem Industri', 3, 'Study of industrial system analysis principles, including process analysis, system modeling, and performance evaluation.'),
		('FTI-105', 'Desain Sistem Industri', 3, 'Study of industrial system design principles, including system architecture, design methodologies, and implementation strategies.'),
		('FTI-106', 'Ergonomi dan Keselamatan Kerja', 3, 'Study of ergonomics and occupational safety principles, including human factors, workplace design, and safety regulations.'),
		('FTI-107', 'Analisis Data Industri', 3, 'Study of industrial data analysis principles, including data mining, statistical analysis, and data-driven decision making.'),
		('FTI-108', 'Manajemen Proyek', 3, 'Study of project management principles, including project planning, execution, and control.'),
		('FTI-109', 'Kerja Sama Tim', 3, 'Study of team collaboration principles, including communication, leadership, and teamwork.'),
		('FTI-110', 'Pengantar Kewirausahaan', 3, 'Introduction to entrepreneurship principles, including business planning, innovation, and venture creation.')
) AS v(code, name, credits, description)
INNER JOIN faculties f ON f.code = split_part(v.code, '-', 1)
ON CONFLICT (code) DO UPDATE SET
	name = EXCLUDED.name,
	credits = EXCLUDED.credits,
	description = EXCLUDED.description,
	faculty_id = EXCLUDED.faculty_id;

-- 5. Seed Class Schedules (10 conflict-free slots per faculty; FCS core pinned to h.2.4)
WITH faculty_order(faculty_code, faculty_ord, inst1, inst2, inst3, inst4, inst5) AS (
	VALUES
		('FCS', 1, 'Dr. Budi Santoso, M.Kom.', 'Dr. Siti Rahmawati, M.T.', 'Prof. Hendra Wijaya, Ph.D.', 'Dr. Hanan Al-Hassan', 'Dr. Rina Kusuma, M.Cs.'),
		('FEB', 2, 'Prof. Arif Budiman, S.E., M.B.A.', 'Dr. Maya Puspita, M.Si.', 'Dr. Dedi Kurniawan, M.M.', 'Dr. Ratna Sari Dewi, M.Ak.', 'Dr. Fajar Nugroho, M.Ec.'),
		('FIB', 3, 'Prof. Lestari Handayani, M.Hum.', 'Dr. Bagus Setiawan, M.A.', 'Dr. Intan Permatasari, M.Hum.', 'Dr. Reza Pahlevi, Ph.D.', 'Dr. Yuniarti Kartika, M.Li.'),
		('FTE', 4, 'Prof. Agus Supriyadi, S.T., M.T.', 'Dr. Wahyu Hidayat, M.Eng.', 'Dr. Dian Pratiwi, S.T., Ph.D.', 'Dr. Eko Prasetyo, M.T.', 'Dr. Surya Darmawan, M.Sc.'),
		('FBM', 5, 'Dr. dr. Nadia Kartikasari, M.Biomed.', 'Prof. Ilham Ramadhan, Ph.D.', 'Dr. Putri Ayu Lestari, M.T.', 'Dr. Hendri Gunawan, M.Eng.', 'Dr. Citra Maharani, S.T., M.Sc.'),
		('FTI', 6, 'Prof. Bambang Suryono, M.T.', 'Dr. Taufik Hidayatullah, M.Eng.', 'Dr. Nisa Amalia, S.T., M.T.', 'Dr. Yoga Pratama, M.Sc.', 'Dr. Kartika Wulandari, M.T.')
),
faculty_building_share AS (
	SELECT
		f.id AS faculty_id,
		fo.faculty_code,
		fo.faculty_ord,
		f.building_id,
		fo.inst1,
		fo.inst2,
		fo.inst3,
		fo.inst4,
		fo.inst5,
		(ROW_NUMBER() OVER (PARTITION BY f.building_id ORDER BY fo.faculty_ord) - 1)::int AS share_idx,
		(COUNT(*) OVER (PARTITION BY f.building_id))::int AS building_faculty_count
	FROM faculty_order fo
	INNER JOIN faculties f ON f.code = fo.faculty_code
),
ordered_building_rooms AS (
	SELECT
		r.id AS room_id,
		r.code AS room_code,
		r.building_id,
		(ROW_NUMBER() OVER (PARTITION BY r.building_id ORDER BY r.floor ASC, r.room_number::int ASC) - 1)::int AS room_idx,
		(COUNT(*) OVER (PARTITION BY r.building_id))::int AS building_room_count
	FROM rooms r
	INNER JOIN buildings b ON b.id = r.building_id
	WHERE b.code IN ('B', 'C', 'D', 'G', 'H', 'I')
		AND r.room_number ~ '^[0-9]+$'
),
faculty_rooms AS (
	SELECT
		fbs.faculty_id,
		fbs.faculty_code,
		obr.room_id,
		obr.room_code,
		obr.room_idx
	FROM faculty_building_share fbs
	INNER JOIN ordered_building_rooms obr
		ON obr.building_id = fbs.building_id
		AND obr.room_idx >= fbs.share_idx * (obr.building_room_count / fbs.building_faculty_count)
		AND obr.room_idx < (fbs.share_idx + 1) * (obr.building_room_count / fbs.building_faculty_count)
),
primary_rooms AS (
	SELECT DISTINCT ON (fr.faculty_code)
		fr.faculty_code,
		fr.room_id AS primary_room_id
	FROM faculty_rooms fr
	ORDER BY
		fr.faculty_code,
		CASE WHEN fr.faculty_code = 'FCS' AND fr.room_code = 'h.2.4' THEN 0 ELSE 1 END,
		fr.room_idx ASC
),
secondary_rooms AS (
	SELECT
		fr.faculty_code,
		fr.room_id AS secondary_room_id,
		(ROW_NUMBER() OVER (PARTITION BY fr.faculty_code ORDER BY fr.room_idx ASC) - 1)::int AS sec_idx,
		(COUNT(*) OVER (PARTITION BY fr.faculty_code))::int AS sec_count
	FROM faculty_rooms fr
	INNER JOIN primary_rooms pr ON pr.faculty_code = fr.faculty_code
	WHERE fr.room_id <> pr.primary_room_id
),
ordered_courses AS (
	SELECT
		c.id AS course_id,
		c.code AS course_code,
		f.code AS faculty_code,
		(ROW_NUMBER() OVER (PARTITION BY f.code ORDER BY c.code ASC) - 1)::int AS slot_idx
	FROM courses c
	INNER JOIN faculties f ON f.id = c.faculty_id
	INNER JOIN faculty_order fo ON fo.faculty_code = f.code
	WHERE c.code ~ '^(FCS|FEB|FIB|FTE|FBM|FTI)-1(0[1-9]|10)$'
),
slot_templates(slot_idx, inst_slot, day_of_week, start_time, end_time) AS (
	VALUES
		(0, 1, 'Monday',    '09:00', '11:30'),
		(1, 2, 'Tuesday',   '13:00', '15:30'),
		(2, 3, 'Wednesday', '09:00', '11:30'),
		(3, 4, 'Thursday',  '10:00', '12:30'),
		(4, 5, 'Friday',    '13:30', '16:00'),
		(5, 2, 'Monday',    '13:00', '15:30'),
		(6, 3, 'Tuesday',   '09:00', '11:30'),
		(7, 4, 'Wednesday', '13:00', '15:30'),
		(8, 5, 'Thursday',  '13:30', '16:00'),
		(9, 1, 'Friday',    '09:00', '11:30')
)
INSERT INTO class_schedules (
	course_id,
	room_id,
	section,
	instructor,
	day_of_week,
	start_time,
	end_time,
	academic_term,
	max_capacity
)
SELECT
	oc.course_id,
	CASE
		WHEN oc.slot_idx < 5 THEN pr.primary_room_id
		ELSE COALESCE(sr.secondary_room_id, pr.primary_room_id)
	END AS room_id,
	'A' AS section,
	CASE st.inst_slot
		WHEN 1 THEN fbs.inst1
		WHEN 2 THEN fbs.inst2
		WHEN 3 THEN fbs.inst3
		WHEN 4 THEN fbs.inst4
		WHEN 5 THEN fbs.inst5
	END AS instructor,
	st.day_of_week,
	st.start_time,
	st.end_time,
	'2026/2027-Odd' AS academic_term,
	30 AS max_capacity
FROM ordered_courses oc
INNER JOIN faculty_building_share fbs ON fbs.faculty_code = oc.faculty_code
INNER JOIN slot_templates st ON st.slot_idx = oc.slot_idx
INNER JOIN primary_rooms pr ON pr.faculty_code = oc.faculty_code
LEFT JOIN secondary_rooms sr
	ON sr.faculty_code = oc.faculty_code
	AND oc.slot_idx >= 5
	AND sr.sec_idx = ((oc.slot_idx - 5) % sr.sec_count)
ORDER BY fbs.faculty_ord, oc.slot_idx
ON CONFLICT (course_id, section, academic_term) DO UPDATE SET
	room_id = EXCLUDED.room_id,
	instructor = EXCLUDED.instructor,
	day_of_week = EXCLUDED.day_of_week,
	start_time = EXCLUDED.start_time,
	end_time = EXCLUDED.end_time,
	max_capacity = EXCLUDED.max_capacity;

-- 6. Seed 60 Demo Students (10 per faculty; preserves existing user_id passkey links)
INSERT INTO students (student_id, name, department, photo_url)
SELECT
	v.student_id,
	v.name,
	f.name AS department,
	v.photo_url
FROM (
	VALUES
		('STU-FCS-001', 'David Kim', '/students/student-1.png'),
		('STU-FCS-002', 'Siddharth Anand', '/students/student-2.png'),
		('STU-FCS-003', 'Thais Lindqvist', '/students/student-3.png'),
		('STU-FCS-004', 'Rizky Pratama', NULL),
		('STU-FCS-005', 'Nadia Putri Maharani', NULL),
		('STU-FCS-006', 'Bima Arya Wijaya', NULL),
		('STU-FCS-007', 'Aulia Rahma Sari', NULL),
		('STU-FCS-008', 'Kevin Tanoto', NULL),
		('STU-FCS-009', 'Salsabila Nur Azizah', NULL),
		('STU-FCS-010', 'Dimas Aditya Saputra', NULL),
		('STU-FEB-001', 'Muhammad Farhan Akbar', NULL),
		('STU-FEB-002', 'Anisa Fitriani', NULL),
		('STU-FEB-003', 'Jonathan Halim', NULL),
		('STU-FEB-004', 'Tiara Kusuma Wardani', NULL),
		('STU-FEB-005', 'Reza Mahendra', NULL),
		('STU-FEB-006', 'Clarissa Wijaya', NULL),
		('STU-FEB-007', 'Aldi Firmansyah', NULL),
		('STU-FEB-008', 'Sekar Ayu Ningrum', NULL),
		('STU-FEB-009', 'Daffa Raihan Putra', NULL),
		('STU-FEB-010', 'Natasya Permata', NULL),
		('STU-FIB-001', 'Kirana Larasati', NULL),
		('STU-FIB-002', 'Galih Rakasiwi', NULL),
		('STU-FIB-003', 'Zahra Amina Putri', NULL),
		('STU-FIB-004', 'Arjuna Satria Wibowo', NULL),
		('STU-FIB-005', 'Melati Puspa Negara', NULL),
		('STU-FIB-006', 'Fikri Haikal', NULL),
		('STU-FIB-007', 'Nabila Syakieb', NULL),
		('STU-FIB-008', 'Rangga Adi Nugraha', NULL),
		('STU-FIB-009', 'Dewi Anggraini', NULL),
		('STU-FIB-010', 'Samuel Situmorang', NULL),
		('STU-FTE-001', 'Ilham Maulana', NULL),
		('STU-FTE-002', 'Putri Maharani', NULL),
		('STU-FTE-003', 'Daniel Christian', NULL),
		('STU-FTE-004', 'Fauzan Azima', NULL),
		('STU-FTE-005', 'Shinta Dewi Pertiwi', NULL),
		('STU-FTE-006', 'Bayu Segara', NULL),
		('STU-FTE-007', 'Alya Zahra', NULL),
		('STU-FTE-008', 'Hafiz Abdurrahman', NULL),
		('STU-FTE-009', 'Vina Panduwinata', NULL),
		('STU-FTE-010', 'Raka Pradipta', NULL),
		('STU-FBM-001', 'Aurelia Susanto', NULL),
		('STU-FBM-002', 'Naufal Dzaki', NULL),
		('STU-FBM-003', 'Keisya Levronka', NULL),
		('STU-FBM-004', 'Rayhan Fadillah', NULL),
		('STU-FBM-005', 'Syifa Hadju', NULL),
		('STU-FBM-006', 'Gilang Dirga Saputra', NULL),
		('STU-FBM-007', 'Intan Nuraini', NULL),
		('STU-FBM-008', 'Bryan Domani', NULL),
		('STU-FBM-009', 'Yasmin Napper', NULL),
		('STU-FBM-010', 'Akbar Tanjung', NULL),
		('STU-FTI-001', 'Bagas Adi Prayoga', NULL),
		('STU-FTI-002', 'Cinta Laura Wijaya', NULL),
		('STU-FTI-003', 'Rafi Ahmad Fauzi', NULL),
		('STU-FTI-004', 'Prilly Latuconsina', NULL),
		('STU-FTI-005', 'Iqbaal Ramadhan', NULL),
		('STU-FTI-006', 'Mawar Eva De Jongh', NULL),
		('STU-FTI-007', 'Angga Yunanda', NULL),
		('STU-FTI-008', 'Febby Rastanty', NULL),
		('STU-FTI-009', 'Jefri Nichol Pratama', NULL),
		('STU-FTI-010', 'Velove Vexia', NULL)
) AS v(student_id, name, photo_url)
INNER JOIN faculties f ON f.code = split_part(v.student_id, '-', 2)
ON CONFLICT (student_id) DO UPDATE SET
	name = EXCLUDED.name,
	department = EXCLUDED.department,
	photo_url = EXCLUDED.photo_url;

-- 7. Seed Cohort Auto-Enrollments (5 core courses + 2 non-clashing upper courses = 7 per student)
WITH ordered_students AS (
	SELECT
		s.id AS student_uuid,
		split_part(s.student_id, '-', 2) AS faculty_code,
		(ROW_NUMBER() OVER (
			PARTITION BY split_part(s.student_id, '-', 2)
			ORDER BY s.student_id ASC
		) - 1)::int AS student_idx
	FROM students s
	WHERE s.student_id ~ '^STU-(FCS|FEB|FIB|FTE|FBM|FTI)-0(0[1-9]|10)$'
),
ordered_schedules AS (
	SELECT
		cs.id AS class_schedule_id,
		f.code AS faculty_code,
		(ROW_NUMBER() OVER (
			PARTITION BY f.code
			ORDER BY c.code ASC
		) - 1)::int AS course_idx
	FROM class_schedules cs
	INNER JOIN courses c ON c.id = cs.course_id
	INNER JOIN faculties f ON f.id = c.faculty_id
	WHERE c.code ~ '^(FCS|FEB|FIB|FTE|FBM|FTI)-1(0[1-9]|10)$'
		AND cs.section = 'A'
		AND cs.academic_term = '2026/2027-Odd'
)
INSERT INTO student_schedules (student_id, class_schedule_id, status)
SELECT
	os.student_uuid,
	osc.class_schedule_id,
	'enrolled' AS status
FROM ordered_students os
INNER JOIN ordered_schedules osc
	ON osc.faculty_code = os.faculty_code
	AND (
		osc.course_idx < 5
		OR osc.course_idx = 5 + (os.student_idx % 5)
		OR osc.course_idx = 5 + ((os.student_idx + 1) % 5)
	)
ORDER BY os.faculty_code, os.student_idx, osc.course_idx
ON CONFLICT (student_id, class_schedule_id) DO UPDATE SET
	status = EXCLUDED.status;

COMMIT;

\pset tuples_only on
\pset format unaligned
SELECT format(
	'Seeded %s buildings, %s rooms, %s faculties, %s courses, %s schedules, %s students, and %s student enrollments.',
	(SELECT count(*) FROM buildings WHERE code IN ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I')),
	(SELECT count(*) FROM rooms r INNER JOIN buildings b ON b.id = r.building_id WHERE b.code IN ('B', 'C', 'D', 'G', 'H', 'I')),
	(SELECT count(*) FROM faculties WHERE code IN ('FCS', 'FEB', 'FIB', 'FTE', 'FBM', 'FTI')),
	(SELECT count(*) FROM courses WHERE code ~ '^(FCS|FEB|FIB|FTE|FBM|FTI)-1(0[1-9]|10)$'),
	(SELECT count(*) FROM class_schedules cs INNER JOIN courses c ON c.id = cs.course_id WHERE c.code ~ '^(FCS|FEB|FIB|FTE|FBM|FTI)-1(0[1-9]|10)$' AND cs.section = 'A' AND cs.academic_term = '2026/2027-Odd'),
	(SELECT count(*) FROM students WHERE student_id ~ '^STU-(FCS|FEB|FIB|FTE|FBM|FTI)-0(0[1-9]|10)$'),
	(SELECT count(*) FROM student_schedules ss INNER JOIN students s ON s.id = ss.student_id WHERE s.student_id ~ '^STU-(FCS|FEB|FIB|FTE|FBM|FTI)-0(0[1-9]|10)$')
);
SQL
