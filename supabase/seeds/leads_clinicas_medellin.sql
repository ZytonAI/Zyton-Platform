-- ─────────────────────────────────────────────────────────────────
-- LEADS: Clínicas odontológicas Medellín
-- Pega esto en Supabase → SQL Editor y ejecuta.
-- El owner_id se toma automáticamente del primer usuario registrado.
-- Si tienes varios usuarios, reemplaza la subconsulta por tu UUID.
-- ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
  uid UUID := (SELECT id FROM auth.users ORDER BY created_at LIMIT 1);
BEGIN

INSERT INTO public.leads
  (owner_id, name, phone, website, company, status, source, priority)
VALUES
-- ── PRIORIDAD ALTA (tienen página web) ──────────────────────────
(uid, 'Dental Specialists Medellín',                            '573007008281', 'https://dentalmedellin.com/',                                          'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'Clínica Viena / Veneers Medellín',                      '573224776418', 'https://clinicaviena.com/',                                            'Dentista cosmético',                 'new', 'import', 'alta'),
(uid, 'W SMILE premium dental practice',                        '573226780602', 'http://www.wsmile.com.co/',                                            'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'Dra. Erika Diaz Odontología Estética e Integral',        '573012352198', 'https://bjored.my.canva.site/erikadiazodontologia',                    'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'Ortoclin Sede Santa Lucia',                              '573134555223', 'https://www.instagram.com/ortoclin.col/',                              'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'Clínica Odontológica de Antioquia - CLODAN sas.',        '573192746973', 'https://clodan.com.co/',                                               'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'Dr. Mauricio Arias - Odontólogo Experto English Dentist','573006705124', 'https://mauricioariasexperience.com/',                                 'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'Lina Fernández Odontología - Diseño de sonrisa',         '573242910840', 'http://linafernandez.co/',                                             'Dentista',                           'new', 'import', 'alta'),
(uid, 'Ortounion Clínica Odontológica',                         '573117678677', 'https://www.ortounion.com/',                                           'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'Oral Center Poblado',                                    '573043493080', 'http://oralcenter.com.co/',                                            'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'Odontología Dra. Tatiana Vasquez smile design',          '573205574802', 'https://smiledesignscolombia.com/',                                    'Dentista',                           'new', 'import', 'alta'),
(uid, 'Clínica Ártica',                                         '573044484847', 'https://www.clinicaartica.com/',                                       'Dentista',                           'new', 'import', 'alta'),
(uid, 'Trébol Odontología Especializada Medellín',              '573188297858', 'https://trebolodontologia.com/',                                       'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'DentiSalud El Poblado - Clínicas Odontológicas',         '573043495900', 'http://www.dentisalud.com.co/',                                        'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'Urgencias Odontológicas 24 horas las Vegas',             '573044608222', 'https://uev.com.co/',                                                  'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'Dentioral - Sede Poblado',                               '573044448911', 'https://dentioral.com/',                                               'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'Jenny Villada Clínicas Odontológicas',                   '573164112289', 'https://artistasdesonrisas.com/es/',                                   'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'Royal Dental Care',                                      '573208201361', 'http://royaldentalcare.co/',                                           'Dentista',                           'new', 'import', 'alta'),
(uid, 'Oral Studio',                                            '573127093687', 'https://www.oralstudio.com.co/',                                       'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'MDental Láser',                                          '573206896499', 'http://mdentalaser.com/',                                              'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'Dental Center',                                          '573042686922', 'http://www.dentalcenter.com.co/',                                      'Dentista',                           'new', 'import', 'alta'),
(uid, 'Dra. Valentina González',                                '573126668428', 'https://www.instagram.com/dravalentinagonzalez?igsh=ZJlkZ2lnYm53YnZx', 'Dentista',                           'new', 'import', 'alta'),
(uid, 'Bocas&Risas - Clínica Odontológica en Medellín',         '573013248706', 'https://www.bocasyricas.com/',                                         'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'Smile Natural Studio - Clínica & Spa Odontológico',      '573006370177', 'https://smilenaturalstudio.com/',                                      'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'Dental Expertos',                                        '573008938020', 'https://www.instagram.com/dentalexpertos',                             'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'Clínica Unilaser',                                       '573012792874', 'https://clinicaunilaser.com/',                                         'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'Clínica Dental Home - Sede Poblado',                     '573104163897', 'https://clinicadentalhome.com/',                                       'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'Premium Dental Medellín',                                '573204010740', 'http://premiumdentalmedellin.com/',                                    'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'Dental Sonrisas',                                        '573012642772', 'https://instagram.com/dentalsonrisasyp',                               'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'Clínica Dental Home - Sede 2',                           '573104194654', 'https://clinicadentalhome.com/',                                       'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'Oralimagen - Dental Implants',                           '573167449425', 'http://www.oralimagen.com/',                                           'Periodoncista de implantes dentales', 'new', 'import', 'alta'),
(uid, 'Odontoss Laureles',                                      '573044440062', 'http://www.odontoss.com/',                                             'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'Naturaldent',                                            '573115410224', 'https://www.instagram.com/naturaldento',                               'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'OdontoestéticaDH',                                       '573053222670', 'http://odontosteticadh.com/',                                          'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'DentiSalud Floresta - Clínica Odontológica',             '573045579085', 'http://www.dentisalud.com.co/',                                        'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'Sanadent Odontólogos - La Mejor Clínica Dental Medellín','573044486126', 'http://www.sanadentodontologos.com.co/',                               'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'ORAL CONCEPT INVISALIGN',                                '573137662008', 'https://oralconcept.co/home/oral-concept',                             'Dentista cosmético',                 'new', 'import', 'alta'),
(uid, 'Clínica Colombiana de Implantes Dentales',               '573166900299', 'https://clinicacolombianadeimplantes.com/',                            'Dentista',                           'new', 'import', 'alta'),
(uid, 'Infinity Smile',                                         '573234650026', 'https://infinitysmile.com/',                                           'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'DentiOral - Sede Belén',                                 '573044448911', 'https://www.dentioral.com/',                                           'Clínica dental',                     'new', 'import', 'alta'),
(uid, 'Clínica Odontológica Oral Laser Estadio',                '573044440840', 'http://www.oralaser.com.co/',                                          'Clínica dental',                     'new', 'import', 'alta'),

-- ── SIN PRIORIDAD (sin página web) ──────────────────────────────
(uid, 'Odontología Especializada Medellín',                     '573007008281', NULL,                                                                   'Clínica dental',                     'new', 'import', NULL),
(uid, 'Odontologos en Medellín',                                '573052581651', NULL,                                                                   'Dentista',                           'new', 'import', NULL),
(uid, 'Dra. Ángela Giraldo',                                    '573022200401', NULL,                                                                   NULL,                                 'new', 'import', NULL),
(uid, 'Oralprado',                                              '573122172282', NULL,                                                                   'Ortodoncista',                       'new', 'import', NULL),
(uid, 'Plenitud Oral Consultorio Odontológico',                 '572864149',    NULL,                                                                   'Dentista',                           'new', 'import', NULL),
(uid, 'Odonto Super',                                           '573188559859', NULL,                                                                   'Ortodoncista',                       'new', 'import', NULL);

END $$;
