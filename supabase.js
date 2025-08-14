// Configuración de Supabase y funciones para la aplicación de evaluación de catedráticos

// Configuración de Supabase usando variables de entorno con fallback
const SUPABASE_URL = 'https://onncrefefsvdmpxthxtw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ubmNyZWZlZnN2ZG1weHRoeHR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0Mjk5MDksImV4cCI6MjA3MDAwNTkwOX0.UEmH6tAFz4SmS1dtJS0fYq0V0bXC_ixZspy08Dx-xZ8';

// Inicializar cliente de Supabase
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==== AUTENTICACIÓN ====

// Iniciar sesión con email y contraseña
async function signIn(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });
  
  if (error) throw error;
  await saveSessionToStorage(data.session);
  return data.user;
}

// Registrar nuevo usuario
async function signUp(email, password) {
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password
  });
  
  if (error) throw error;
  if (data.session) await saveSessionToStorage(data.session);
  return data.user;
}

// Cerrar sesión
async function signOut() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) throw error;
  sessionStorage.removeItem('supabase.auth.token');
  localStorage.removeItem('supabase.auth.token');
  return true;
}

// Obtener el usuario actual
async function getCurrentUser() {
  const { data, error } = await supabaseClient.auth.getUser();
  if (error) return null;
  return data.user;
}

// Verificar si el usuario está autenticado
async function isAuthenticated() {
  const user = await getCurrentUser();
  return user !== null;
}

// Almacenar sesión para persistencia
async function saveSessionToStorage(session) {
  if (session) {
    localStorage.setItem('supabase.auth.token', JSON.stringify(session));
  }
}

// ==== MANEJO DE DATOS DE CATEDRÁTICOS ====

// Obtener todos los catedráticos
async function getProfessors() {
  const { data, error } = await supabaseClient
    .from('professors')
    .select(`
      *,
      ratings(average)
    `);
  
  if (error) throw error;
  
  // Recalcular ratings basados en las evaluaciones actuales
  const professorsWithUpdatedRatings = data.map(prof => {
    if (prof.ratings && prof.ratings.length > 0) {
      const averageRating = prof.ratings.reduce((sum, rating) => sum + parseFloat(rating.average), 0) / prof.ratings.length;
      prof.rating = parseFloat(averageRating.toFixed(1));
    } else {
      prof.rating = 0;
    }
    return prof;
  });
  
  return professorsWithUpdatedRatings;
}

// Obtener un catedrático por ID
async function getProfessorById(id) {
  const { data, error } = await supabaseClient
    .from('professors')
    .select(`
      *,
      ratings(*),
      comments(
        *,
        comment_likes(id)
      )
    `)
    .eq('id', id)
    .single();
  
  if (error) throw error;
  
  // Recalcular el rating basado en las evaluaciones actuales
  if (data && data.ratings && data.ratings.length > 0) {
    const averageRating = data.ratings.reduce((sum, rating) => sum + parseFloat(rating.average), 0) / data.ratings.length;
    data.rating = parseFloat(averageRating.toFixed(1));
  } else {
    data.rating = 0;
  }
  
  // Agregar conteo de likes a cada comentario y ordenar por likes
  if (data && data.comments) {
    data.comments = data.comments.map(comment => {
      comment.likes_count = comment.comment_likes?.length || 0;
      return comment;
    }).sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0)); // Ordenar por likes descendente
  }
  
  return data;
}

// Obtener los catedráticos mejor evaluados
async function getTopRatedProfessors(limit = 5) {
  // Obtener TODOS los profesores con sus ratings para recalcular correctamente
  const { data, error } = await supabaseClient
    .from('professors')
    .select(`
      *,
      ratings(average)
    `);
  
  if (error) throw error;
  
  // Recalcular ratings para cada profesor
  const professorsWithUpdatedRatings = data.map(prof => {
    if (prof.ratings && prof.ratings.length > 0) {
      const averageRating = prof.ratings.reduce((sum, rating) => sum + parseFloat(rating.average), 0) / prof.ratings.length;
      prof.rating = parseFloat(averageRating.toFixed(1));
    } else {
      prof.rating = 0;
    }
    return prof;
  });
  
  // Filtrar solo los que tienen evaluaciones (rating > 0) y ordenar por rating actualizado
  const topRated = professorsWithUpdatedRatings
    .filter(prof => prof.rating > 0)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, limit);
    
  console.log('Top rated professors recalculados:', topRated.map(p => ({
    name: p.name,
    rating: p.rating,
    evaluationsCount: p.ratings?.length || 0
  })));
  
  return topRated;
}

// Buscar catedráticos por nombre
async function searchProfessors(query) {
  const { data, error } = await supabaseClient
    .from('professors')
    .select(`
      *,
      ratings(average)
    `)
    .ilike('name', `%${query}%`);
  
  if (error) throw error;
  
  // Recalcular ratings basados en las evaluaciones actuales
  const professorsWithUpdatedRatings = data.map(prof => {
    if (prof.ratings && prof.ratings.length > 0) {
      const averageRating = prof.ratings.reduce((sum, rating) => sum + parseFloat(rating.average), 0) / prof.ratings.length;
      prof.rating = parseFloat(averageRating.toFixed(1));
    } else {
      prof.rating = 0;
    }
    return prof;
  });
  
  return professorsWithUpdatedRatings;
}

// ==== MANEJO DE EVALUACIONES ====

// Enviar una nueva evaluación
async function submitEvaluation(professorId, evaluation) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Usuario no autenticado');

  const { dominio, metodologia, puntualidad, comments } = evaluation;
  
  // Calcular el rating promedio
  const averageRating = ((dominio + metodologia + puntualidad) / 3).toFixed(1);
  
  console.log('Enviando evaluación:', {
    professorId,
    dominio,
    metodologia, 
    puntualidad,
    averageRating,
    comments
  });
  
  // 1. Guardar la evaluación en la tabla 'ratings'
  const { data: ratingData, error: ratingError } = await supabaseClient
    .from('ratings')
    .insert({
      professor_id: professorId,
      user_id: user.id,
      dominio,
      metodologia,
      puntualidad,
      average: averageRating
    })
    .select();
    
  if (ratingError) {
    console.error('Error al guardar rating:', ratingError);
    throw ratingError;
  }
  
  console.log('Rating guardado exitosamente:', ratingData);
  
  // 2. Guardar el comentario si existe
  if (comments && comments.trim() !== '') {
    const { data: commentData, error: commentError } = await supabaseClient
      .from('comments')
      .insert({
        professor_id: professorId,
        user_id: user.id,
        text: comments,
        date: new Date().toISOString().split('T')[0]
      })
      .select();
      
    if (commentError) {
      console.error('Error al guardar comentario:', commentError);
      throw commentError;
    }
    
    console.log('Comentario guardado exitosamente:', commentData);
  }
  
  // 3. Actualizar el rating promedio del catedrático
  const newAverage = await updateProfessorRating(professorId);
  console.log('Rating del profesor actualizado:', newAverage);
  
  return true;
}

// Actualizar el rating promedio de un catedrático
async function updateProfessorRating(professorId) {
  // Obtener todas las evaluaciones del profesor
  const { data, error } = await supabaseClient
    .from('ratings')
    .select('average')
    .eq('professor_id', professorId);
    
  if (error) throw error;
  
  if (data && data.length > 0) {
    // Calcular el promedio
    const ratings = data.map(r => parseFloat(r.average));
    const averageRating = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
    
    // Actualizar el catedrático
    const { error: updateError } = await supabaseClient
      .from('professors')
      .update({ rating: parseFloat(averageRating.toFixed(1)) })
      .eq('id', professorId);
      
    if (updateError) throw updateError;
    
    console.log(`Rating actualizado para profesor ${professorId}: ${averageRating.toFixed(1)}`);
    return averageRating;
  } else {
    // Si no hay evaluaciones, mantener rating en 0
    const { error: updateError } = await supabaseClient
      .from('professors')
      .update({ rating: 0 })
      .eq('id', professorId);
      
    if (updateError) throw updateError;
    
    console.log(`No hay evaluaciones para profesor ${professorId}, rating mantenido en 0`);
    return 0;
  }
}

// Verificar si un usuario ya evaluó a un catedrático
async function hasUserEvaluatedProfessor(professorId) {
  const user = await getCurrentUser();
  if (!user) return false;

  const { data, error } = await supabaseClient
    .from('ratings')
    .select('id')
    .eq('professor_id', professorId)
    .eq('user_id', user.id)
    .maybeSingle();
    
  if (error) throw error;
  return data !== null;
}

// Obtener evaluaciones realizadas por el usuario actual con detalles del profesor
async function getUserEvaluations() {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabaseClient
    .from('ratings')
    .select(`
      *,
      professors(id, name, courses, avatar, rating)
    `)
    .eq('user_id', user.id)
    .order('average', { ascending: false }); // Ordenar por rating descendente
    
  if (error) throw error;
  return data;
}

// Obtener comentarios realizados por el usuario actual
async function getUserComments() {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabaseClient
    .from('comments')
    .select(`
      *,
      professors(id, name, courses, avatar)
    `)
    .eq('user_id', user.id)
    .order('date', { ascending: false }); // Más recientes primero
    
  if (error) throw error;
  return data;
}

// Obtener todos los comentarios de todos los usuarios con información del profesor
async function getAllCommentsWithProfessors() {
  const { data, error } = await supabaseClient
    .from('comments')
    .select(`
      *,
      professors(
        id, 
        name, 
        courses, 
        avatar, 
        rating,
        ratings(dominio, metodologia, puntualidad, average)
      ),
      comment_likes(id)
    `)
    .order('date', { ascending: false }); // Más recientes primero
    
  if (error) throw error;
  
  // Agrupar por profesor y ordenar profesores por rating
  const professorComments = {};
  
  data.forEach(comment => {
    const profId = comment.professor_id;
    if (!professorComments[profId]) {
      professorComments[profId] = {
        professor: comment.professors,
        comments: []
      };
    }
    
    // Agregar conteo de likes al comentario
    comment.likes_count = comment.comment_likes?.length || 0;
    
    professorComments[profId].comments.push(comment);
  });
  
  // Ordenar comentarios de cada profesor por likes (mayor a menor)
  Object.values(professorComments).forEach(profData => {
    profData.comments.sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0));
  });
  
  // Convertir a array y ordenar profesores por rating
  const result = Object.values(professorComments).sort((a, b) => 
    (b.professor.rating || 0) - (a.professor.rating || 0)
  );
  
  return result;
}

// Dar like a un comentario
async function likeComment(commentId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Usuario no autenticado');

  const { data, error } = await supabaseClient
    .from('comment_likes')
    .insert({
      comment_id: commentId,
      user_id: user.id
    })
    .select();
    
  if (error) {
    // Si ya existe el like, quitar el like (toggle)
    if (error.code === '23505') { // Unique constraint violation
      return await unlikeComment(commentId);
    }
    throw error;
  }
  
  return data;
}

// Quitar like de un comentario
async function unlikeComment(commentId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Usuario no autenticado');

  const { data, error } = await supabaseClient
    .from('comment_likes')
    .delete()
    .eq('comment_id', commentId)
    .eq('user_id', user.id)
    .select();
    
  if (error) throw error;
  return data;
}

// Verificar si el usuario ya dio like a un comentario
async function hasUserLikedComment(commentId) {
  const user = await getCurrentUser();
  if (!user) return false;

  const { data, error } = await supabaseClient
    .from('comment_likes')
    .select('id')
    .eq('comment_id', commentId)
    .eq('user_id', user.id)
    .maybeSingle();
    
  if (error) throw error;
  return data !== null;
}

// Obtener likes de múltiples comentarios para el usuario actual
async function getUserLikesForComments(commentIds) {
  const user = await getCurrentUser();
  if (!user || !commentIds.length) return [];

  const { data, error } = await supabaseClient
    .from('comment_likes')
    .select('comment_id')
    .eq('user_id', user.id)
    .in('comment_id', commentIds);
    
  if (error) throw error;
  return data.map(like => like.comment_id);
}

// Agregar un nuevo catedrático (función anónima)
async function addProfessor(name, course) {
  // Generar avatar aleatorio con las iniciales del nombre
  const initials = name.split(' ').map(word => word.charAt(0)).join('').substring(0, 2).toUpperCase();
  const colors = ['818cf8', 'f472b6', '34d399', 'f97316', '0ea5e9', '8b5cf6', '10b981', 'ef4444', '22c55e', '3b82f6'];
  const randomColor = colors[Math.floor(Math.random() * colors.length)];
  const avatar = `https://placehold.co/64x64/${randomColor}/ffffff?text=${initials}`;
  
  const { data, error } = await supabaseClient
    .from('professors')
    .insert({
      name: name.trim(),
      courses: [course.trim()],
      avatar: avatar,
      rating: 0
    })
    .select();
    
  if (error) throw error;
  return data[0];
}

// Obtener un profesor aleatorio que el usuario no haya evaluado
async function getRandomUnevaluatedProfessor() {
  const user = await getCurrentUser();
  if (!user) {
    // Si no está autenticado, devolver un profesor completamente aleatorio
    const allProfessors = await getProfessors();
    if (allProfessors.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * allProfessors.length);
    return allProfessors[randomIndex];
  }

  // Obtener todos los profesores
  const allProfessors = await getProfessors();
  
  // Obtener las evaluaciones del usuario
  const { data: userRatings, error } = await supabaseClient
    .from('ratings')
    .select('professor_id')
    .eq('user_id', user.id);
    
  if (error) throw error;
  
  const evaluatedIds = userRatings.map(rating => rating.professor_id);
  
  // Filtrar profesores no evaluados
  const unevaluatedProfessors = allProfessors.filter(prof => 
    !evaluatedIds.includes(prof.id)
  );
  
  console.log('Profesores disponibles:', allProfessors.length);
  console.log('Profesores ya evaluados:', evaluatedIds.length);
  console.log('Profesores sin evaluar:', unevaluatedProfessors.length);
  
  if (unevaluatedProfessors.length > 0) {
    // Hay profesores sin evaluar, devolver uno aleatorio
    const randomIndex = Math.floor(Math.random() * unevaluatedProfessors.length);
    return {
      professor: unevaluatedProfessors[randomIndex],
      canEvaluate: true,
      message: 'Evalúa a este catedrático'
    };
  } else {
    // Ya evaluó a todos, devolver uno aleatorio para ver comentarios
    const randomIndex = Math.floor(Math.random() * allProfessors.length);
    return {
      professor: allProfessors[randomIndex],
      canEvaluate: false,
      message: 'Ya has evaluado a todos los catedráticos. Aquí puedes ver los comentarios de:'
    };
  }
}

// Función para sincronizar todos los ratings en la base de datos
async function syncAllProfessorRatings() {
  console.log('Sincronizando todos los ratings de profesores...');
  
  // Obtener todos los profesores
  const { data: professors, error: profError } = await supabaseClient
    .from('professors')
    .select('id, name');
    
  if (profError) throw profError;
  
  const updatePromises = professors.map(async (prof) => {
    await updateProfessorRating(prof.id);
  });
  
  await Promise.all(updatePromises);
  console.log('Sincronización completada para todos los profesores');
}

// ==== MANEJO DE RECURSOS PRO ====

// Obtener recursos de un profesor específico
async function getProfessorResources(professorId) {
  const { data, error } = await supabaseClient
    .from('recursos')
    .select(`
      *,
      professors!id_catedratico(name)
    `)
    .eq('id_catedratico', professorId)
    .eq('status', 'aprobado')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  
  // Calcular rating promedio basado en votos
  const resourcesWithRatings = data.map(resource => {
    const totalVotes = resource.votos_positivos + resource.votos_negativos;
    if (totalVotes > 0) {
      const positiveRatio = resource.votos_positivos / totalVotes;
      resource.average_rating = parseFloat((positiveRatio * 5).toFixed(1));
    } else {
      resource.average_rating = 0;
    }
    resource.rating_count = totalVotes;
    return resource;
  });
  
  return resourcesWithRatings;
}

// Verificar si el usuario tiene suscripción PRO
async function hasProSubscription() {
  const user = await getCurrentUser();
  if (!user) return false;

  const { data, error } = await supabaseClient
    .from('profiles')
    .select('es_pro')
    .eq('id', user.id)
    .maybeSingle();
    
  if (error) {
    console.error('Error verificando suscripción:', error);
    return false;
  }
  
  return data?.es_pro || false;
}

// Subir un nuevo recurso
async function uploadResource(professorId, file, resourceType, academicPeriod) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Usuario no autenticado');

  // Simular subida de archivo (en producción usarías Supabase Storage)
  const fileName = `${Date.now()}_${file.name}`;
  const pathStorage = `recursos-pro/${fileName}`; // Path para el bucket
  
  const { data, error } = await supabaseClient
    .from('recursos')
    .insert({
      id_catedratico: professorId,
      id_usuario_que_subio: user.id,
      nombre_archivo: file.name,
      path_storage: pathStorage,
      tipo_recurso: resourceType,
      periodo_academico: academicPeriod,
      status: 'pendiente' // Requiere aprobación
    })
    .select();
    
  if (error) throw error;
  return data[0];
}

// Calificar un recurso con voto positivo/negativo (solo usuarios PRO)
async function rateResource(resourceId, isPositive) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Usuario no autenticado');
  
  const isPro = await hasProSubscription();
  if (!isPro) throw new Error('Requiere suscripción PRO');

  // Incrementar voto correspondiente
  const columnToIncrement = isPositive ? 'votos_positivos' : 'votos_negativos';
  
  const { data, error } = await supabaseClient
    .rpc('incrementar_voto', {
      recurso_id: resourceId,
      columna: columnToIncrement
    });
    
  if (error) throw error;
  return data;
}

// Obtener estadísticas del usuario (puntos basados en recursos aprobados)
async function getUserStats() {
  const user = await getCurrentUser();
  if (!user) return { points: 0, uploaded_resources: 0, approved_resources: 0 };

  const { data, error } = await supabaseClient
    .from('recursos')
    .select('status')
    .eq('id_usuario_que_subio', user.id);
    
  if (error) {
    console.error('Error obteniendo estadísticas:', error);
    return { points: 0, uploaded_resources: 0, approved_resources: 0 };
  }
  
  const uploaded_resources = data.length;
  const approved_resources = data.filter(r => r.status === 'aprobado').length;
  const points = approved_resources * 100; // 100 puntos por recurso aprobado
  
  return { points, uploaded_resources, approved_resources };
}

// Obtener top contribuidores del mes
async function getTopContributors(limit = 10) {
  const { data, error } = await supabaseClient
    .rpc('get_top_contributors', { limite: limit });
    
  if (error) throw error;
  return data;
}

// === FUNCIONES ESPECÍFICAS DEL ADMIN ===

// Verificar si el usuario es administrador
async function isAdmin(userEmail = null) {
  try {
    // Si no se proporciona email, obtener el del usuario actual
    if (!userEmail) {
      const user = await getCurrentUser();
      if (!user) return false;
      userEmail = user.email;
    }

    // Consultar la tabla admin_users con manejo de errores mejorado
    const { data, error } = await supabaseClient
      .from('admin_users')
      .select('role, is_active')
      .eq('email', userEmail)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      // Si hay un error de política o tabla, loggearlo pero no fallar
      console.warn('Error consultando admin_users (puede ser normal si no eres admin):', error);
      
      // Fallback temporal: verificar con lista hardcodeada mientras se corrige la BD
      const adminEmails = [
        'cotitohn35@gmail.com',
        'mauricio.diaz@admin.com',
        'admin@evalua-t.com'
      ];
      
      return adminEmails.includes(userEmail);
    }

    return data !== null;
  } catch (error) {
    console.warn('Error en isAdmin, usando fallback:', error);
    
    // Fallback temporal
    const adminEmails = [
      'cotitohn35@gmail.com',
      'mauricio.diaz@admin.com', 
      'admin@evalua-t.com'
    ];
    
    return adminEmails.includes(userEmail || '');
  }
}

// Verificar si el usuario es superadministrador
async function isSuperAdmin(userEmail = null) {
  try {
    // Si no se proporciona email, obtener el del usuario actual
    if (!userEmail) {
      const user = await getCurrentUser();
      if (!user) return false;
      userEmail = user.email;
    }

    // Consultar la tabla admin_users
    const { data, error } = await supabaseClient
      .from('admin_users')
      .select('role, is_active')
      .eq('email', userEmail)
      .eq('role', 'superadmin')
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.warn('Error consultando admin_users para superadmin:', error);
      
      // Fallback temporal para superadmins
      const superAdminEmails = [
        'cotitohn35@gmail.com'
      ];
      
      return superAdminEmails.includes(userEmail);
    }

    return data !== null;
  } catch (error) {
    console.warn('Error en isSuperAdmin, usando fallback:', error);
    
    // Fallback temporal
    const superAdminEmails = [
      'cotitohn35@gmail.com'
    ];
    
    return superAdminEmails.includes(userEmail || '');
  }
}

// Obtener rol del usuario admin
async function getAdminRole(userEmail = null) {
  try {
    // Si no se proporciona email, obtener el del usuario actual
    if (!userEmail) {
      const user = await getCurrentUser();
      if (!user) return 'user';
      userEmail = user.email;
    }

    // Consultar la tabla admin_users
    const { data, error } = await supabaseClient
      .from('admin_users')
      .select('role')
      .eq('email', userEmail)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.warn('Error obteniendo rol admin:', error);
      
      // Fallback temporal
      if (userEmail === 'cotitohn35@gmail.com') return 'superadmin';
      
      const adminEmails = [
        'mauricio.diaz@admin.com',
        'admin@evalua-t.com'
      ];
      
      return adminEmails.includes(userEmail) ? 'admin' : 'user';
    }

    return data?.role || 'user';
  } catch (error) {
    console.warn('Error en getAdminRole:', error);
    
    // Fallback temporal
    if (userEmail === 'cotitohn35@gmail.com') return 'superadmin';
    return 'user';
  }
}

// Obtener todos los administradores (solo para superadmins)
async function getAllAdmins() {
  try {
    console.log('🔍 Consultando tabla admin_users...');
    
    const { data, error } = await supabaseClient
      .from('admin_users')
      .select(`
        *,
        created_by_user:created_by(email)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error en consulta admin_users:', error);
      
      // Si hay error de políticas RLS o tabla no existe, devolver array vacío
      if (error.code === 'PGRST116' || error.message.includes('relation') || error.message.includes('policy')) {
        console.warn('⚠️ Tabla admin_users no accesible, devolviendo lista vacía');
        return [];
      }
      
      throw error;
    }
    
    console.log('✅ Administradores obtenidos exitosamente:', data?.length || 0);
    return data || [];
  } catch (error) {
    console.error('❌ Error obteniendo administradores:', error);
    
    // En caso de error crítico, devolver lista vacía en lugar de fallar
    console.warn('⚠️ Devolviendo lista vacía debido a error');
    return [];
  }
}

// Agregar nuevo administrador (solo para superadmins)
async function addAdmin(email, role = 'admin') {
  try {
    console.log('🔄 Iniciando proceso de agregar admin:', email, role);
    
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error('Usuario no autenticado');

    // Verificar que el usuario actual sea superadmin
    const isSuper = await isSuperAdmin();
    if (!isSuper) throw new Error('No tienes permisos para agregar administradores');

    console.log('👑 Usuario confirmado como superadmin, procediendo...');

    // Verificar que el email no esté ya en admin_users
    console.log('🔍 Verificando si ya es administrador...');
    const { data: existingAdmin, error: checkError } = await supabaseClient
      .from('admin_users')
      .select('email')
      .eq('email', email)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error verificando admin existente:', checkError);
      throw checkError;
    }
    
    if (existingAdmin) {
      throw new Error('Este usuario ya es administrador');
    }

    console.log('✅ Email no está en lista de administradores');

    // Intentar buscar el usuario en auth.users usando la función personalizada
    console.log('🔍 Buscando usuario en auth.users...');
    let targetUserId = null;
    
    try {
      const { data: userData, error: userError } = await supabaseClient.rpc('get_user_by_email', {
        user_email: email
      });

      if (userError) {
        console.warn('Función get_user_by_email no disponible:', userError);
      } else if (userData && userData.length > 0) {
        targetUserId = userData[0].id;
        console.log('✅ Usuario encontrado con función RPC:', targetUserId);
      }
    } catch (rpcError) {
      console.warn('Error llamando función RPC:', rpcError);
    }

    // Si no se pudo obtener con RPC, intentar método alternativo
    if (!targetUserId) {
      console.log('⚠️ Intentando método alternativo para encontrar usuario...');
      
      // Como no podemos consultar auth.users directamente, vamos a insertar con user_id null
      // y usar el trigger que creamos para sincronizar
      console.log('📝 Insertando admin sin user_id, el trigger debería sincronizarlo...');
    }

    // Insertar en admin_users
    console.log('💾 Insertando en tabla admin_users...');
    const insertData = {
      email: email,
      role: role,
      created_by: currentUser.id,
      is_active: true
    };

    // Solo agregar user_id si lo encontramos
    if (targetUserId) {
      insertData.user_id = targetUserId;
    }

    const { data, error } = await supabaseClient
      .from('admin_users')
      .insert(insertData)
      .select();

    if (error) {
      console.error('❌ Error insertando administrador:', error);
      
      if (error.code === '23505') { // Constraint violation
        throw new Error('Este usuario ya es administrador');
      } else if (error.code === '23502') { // Not null constraint
        throw new Error(`El usuario con email "${email}" no existe en el sistema. Debe registrarse primero en la aplicación.`);
      } else if (error.message.includes('Usuario no encontrado')) {
        throw new Error(`El usuario con email "${email}" no existe en el sistema. Debe registrarse primero en la aplicación.`);
      }
      
      throw new Error(`Error al agregar administrador: ${error.message}`);
    }
    
    console.log('✅ Administrador agregado exitosamente:', data[0]);
    return data[0];
  } catch (error) {
    console.error('❌ Error agregando administrador:', error);
    throw error;
  }
}

// Actualizar estado de administrador (solo para superadmins)
async function updateAdminStatus(adminId, isActive) {
  try {
    const isSuper = await isSuperAdmin();
    if (!isSuper) throw new Error('No tienes permisos para actualizar administradores');

    const { data, error } = await supabaseClient
      .from('admin_users')
      .update({ is_active: isActive })
      .eq('id', adminId)
      .select();

    if (error) throw error;
    return data[0];
  } catch (error) {
    console.error('Error actualizando estado del administrador:', error);
    throw error;
  }
}

// Actualizar rol de administrador (solo para superadmins)
async function updateAdminRole(adminId, newRole) {
  try {
    const isSuper = await isSuperAdmin();
    if (!isSuper) throw new Error('No tienes permisos para actualizar roles');

    const { data, error } = await supabaseClient
      .from('admin_users')
      .update({ role: newRole })
      .eq('id', adminId)
      .select();

    if (error) throw error;
    return data[0];
  } catch (error) {
    console.error('Error actualizando rol del administrador:', error);
    throw error;
  }
}

// Obtener todos los recursos para el admin
async function getAllResourcesForAdmin() {
  try {
    const { data, error } = await supabaseClient
      .from('recursos')
      .select(`
        *,
        professors!id_catedratico(id, name)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error obteniendo recursos para admin:', error);
    throw error;
  }
}

// Actualizar estado de un recurso (solo admin)
async function updateResourceStatus(resourceId, newStatus) {
  try {
    console.log('updateResourceStatus: Actualizando recurso', resourceId, 'a estado:', newStatus);
    
    // Primero verificar si el recurso existe
    const { data: existingResource, error: checkError } = await supabaseClient
      .from('recursos')
      .select('id, status, nombre_archivo')
      .eq('id', resourceId)
      .single();

    console.log('updateResourceStatus: Verificación de existencia:', { existingResource, checkError });

    if (checkError) {
      console.error('updateResourceStatus: Error verificando recurso:', checkError);
      if (checkError.code === 'PGRST116') {
        throw new Error(`No se encontró el recurso con ID: ${resourceId}`);
      }
      throw checkError;
    }

    if (!existingResource) {
      console.error('updateResourceStatus: Recurso no encontrado');
      throw new Error(`No se encontró el recurso con ID: ${resourceId}`);
    }

    console.log('updateResourceStatus: Recurso encontrado:', existingResource);

    // Intentar actualización normal primero
    const { data, error } = await supabaseClient
      .from('recursos')
      .update({ 
        status: newStatus,
        fecha_revision: new Date().toISOString()
      })
      .eq('id', resourceId)
      .select();

    console.log('updateResourceStatus: Respuesta de actualización:', { data, error });

    if (error) {
      console.error('updateResourceStatus: Error de actualización:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      console.warn('updateResourceStatus: Actualización no devolvió datos - posible problema de RLS');
      
      // Intentar con función RPC como alternativa
      try {
        console.log('updateResourceStatus: Intentando con función RPC...');
        const { data: rpcData, error: rpcError } = await supabaseClient.rpc('update_resource_status_admin', {
          resource_id: resourceId,
          new_status: newStatus,
          admin_email: (await getCurrentUser()).email
        });

        if (rpcError) {
          console.error('updateResourceStatus: Error en RPC:', rpcError);
          throw new Error(`Problema de permisos: No se pudo actualizar el recurso. Contacta al administrador del sistema.`);
        }

        console.log('updateResourceStatus: Actualización exitosa con RPC');
        return { id: resourceId, status: newStatus };
      } catch (rpcError) {
        console.error('updateResourceStatus: RPC fallback falló:', rpcError);
        throw new Error(`Problema de permisos: No se pudo actualizar el recurso con ID: ${resourceId}. Verifica las políticas RLS en Supabase.`);
      }
    }

    console.log('updateResourceStatus: Recurso actualizado exitosamente:', data[0]);
    return data[0];
  } catch (error) {
    console.error('Error actualizando estado del recurso:', error);
    throw error;
  }
}

// Eliminar recurso permanentemente (solo admin)
async function deleteResourcePermanently(resourceId) {
  try {
    console.log('deleteResourcePermanently: Eliminando recurso con ID:', resourceId);
    
    // Primero obtenemos la información del archivo para eliminarlo del storage
    const { data: recurso, error: fetchError } = await supabaseClient
      .from('recursos')
      .select('path_storage')
      .eq('id', resourceId)
      .single();

    console.log('deleteResourcePermanently: Datos del recurso obtenidos:', { recurso, fetchError });

    if (fetchError) {
      console.error('deleteResourcePermanently: Error obteniendo datos del recurso:', fetchError);
      throw fetchError;
    }

    // Eliminar archivo del storage si existe
    if (recurso.path_storage) {
      console.log('deleteResourcePermanently: Eliminando archivo del storage:', recurso.path_storage);
      const fileName = recurso.path_storage.replace('recursos-pro/', '');
      const { error: storageError } = await supabaseClient.storage
        .from('recursos-pro')
        .remove([fileName]);
      
      if (storageError) {
        console.warn('deleteResourcePermanently: Error eliminando archivo del storage (continuando):', storageError);
      } else {
        console.log('deleteResourcePermanently: Archivo eliminado del storage exitosamente');
      }
    }

    // Eliminar registro de la base de datos
    console.log('deleteResourcePermanently: Eliminando registro de la base de datos...');
    const { error } = await supabaseClient
      .from('recursos')
      .delete()
      .eq('id', resourceId);

    if (error) {
      console.error('deleteResourcePermanently: Error eliminando registro de BD:', error);
      throw error;
    }

    console.log('deleteResourcePermanently: Recurso eliminado exitosamente');
    return true;
  } catch (error) {
    console.error('Error eliminando recurso:', error);
    throw error;
  }
}

// Obtener estadísticas generales para el dashboard admin
async function getAdminStats() {
  try {
    // Obtener conteos de recursos por estado
    const { data: recursos, error: recursosError } = await supabaseClient
      .from('recursos')
      .select('status, id_usuario_que_subio');

    if (recursosError) throw recursosError;

    // Obtener conteo de usuarios únicos
    const usuariosUnicos = new Set(recursos.map(r => r.id_usuario_que_subio)).size;

    const stats = {
      total: recursos.length,
      pendientes: recursos.filter(r => r.status === 'pendiente').length,
      aprobados: recursos.filter(r => r.status === 'aprobado').length,
      rechazados: recursos.filter(r => r.status === 'rechazado').length,
      usuariosActivos: usuariosUnicos
    };

    return stats;
  } catch (error) {
    console.error('Error obteniendo estadísticas del admin:', error);
    throw error;
  }
}

// Obtener recursos pendientes de aprobación
async function getPendingResources() {
  try {
    const { data, error } = await supabaseClient
      .from('recursos')
      .select(`
        *,
        professors!id_catedratico(id, name)
      `)
      .eq('status', 'pendiente')
      .order('created_at', { ascending: true }); // Los más antiguos primero

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error obteniendo recursos pendientes:', error);
    throw error;
  }
}

// Aprobar recurso en lote
async function approveResourcesBatch(resourceIds) {
  try {
    const { data, error } = await supabaseClient
      .from('recursos')
      .update({ 
        status: 'aprobado',
        fecha_revision: new Date().toISOString()
      })
      .in('id', resourceIds)
      .select();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error aprobando recursos en lote:', error);
    throw error;
  }
}

// Rechazar recurso en lote
async function rejectResourcesBatch(resourceIds) {
  try {
    const { data, error } = await supabaseClient
      .from('recursos')
      .update({ 
        status: 'rechazado',
        fecha_revision: new Date().toISOString()
      })
      .in('id', resourceIds)
      .select();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error rechazando recursos en lote:', error);
    throw error;
  }
}

// Buscar recursos por criterios específicos
async function searchResourcesForAdmin(filters) {
  try {
    let query = supabaseClient
      .from('recursos')
      .select(`
        *,
        professors!id_catedratico(id, name)
      `);

    // Aplicar filtros
    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters.professorId) {
      query = query.eq('id_catedratico', filters.professorId);
    }

    if (filters.tipoRecurso) {
      query = query.eq('tipo_recurso', filters.tipoRecurso);
    }

    if (filters.periodoAcademico) {
      query = query.eq('periodo_academico', filters.periodoAcademico);
    }

    if (filters.searchTerm) {
      query = query.ilike('nombre_archivo', `%${filters.searchTerm}%`);
    }

    if (filters.dateFrom) {
      query = query.gte('created_at', filters.dateFrom);
    }

    if (filters.dateTo) {
      query = query.lte('created_at', filters.dateTo);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error buscando recursos para admin:', error);
    throw error;
  }
}

// Obtener todos los usuarios registrados (para selección en admin)
async function getAllRegisteredUsers() {
  try {
    console.log('📋 Obteniendo todos los usuarios registrados...');
    
    // Como no podemos acceder directamente a auth.users desde el cliente,
    // intentaremos obtener usuarios únicos de las tablas públicas que tengan user_id
    
    // Obtener usuarios de ratings (evaluaciones)
    const { data: ratingsUsers, error: ratingsError } = await supabaseClient
      .from('ratings')
      .select('user_id')
      .not('user_id', 'is', null);
    
    // Obtener usuarios de comments
    const { data: commentsUsers, error: commentsError } = await supabaseClient
      .from('comments')
      .select('user_id')
      .not('user_id', 'is', null);
    
    // Combinar y obtener IDs únicos
    const userIds = new Set();
    
    if (ratingsUsers) {
      ratingsUsers.forEach(rating => {
        if (rating.user_id) userIds.add(rating.user_id);
      });
    }
    
    if (commentsUsers) {
      commentsUsers.forEach(comment => {
        if (comment.user_id) userIds.add(comment.user_id);
      });
    }
    
    console.log('� IDs únicos encontrados:', userIds.size);
    
    // Si no encontramos usuarios en las tablas públicas, mostrar mensaje
    if (userIds.size === 0) {
      console.log('⚠️ No se encontraron usuarios en las tablas públicas');
      return [
        {
          id: 'demo',
          email: 'cotitohn35@gmail.com',
          created_at: new Date().toISOString(),
          last_sign_in_at: new Date().toISOString(),
          email_confirmed_at: new Date().toISOString()
        }
      ];
    }
    
    // Para cada ID, obtener el email del usuario autenticado actual como ejemplo
    const currentUser = await getCurrentUser();
    if (currentUser) {
      const users = [
        {
          id: currentUser.id,
          email: currentUser.email,
          created_at: currentUser.created_at || new Date().toISOString(),
          last_sign_in_at: new Date().toISOString(),
          email_confirmed_at: new Date().toISOString()
        },
        // Agregar usuarios de prueba comunes
        {
          id: 'demo1',
          email: 'admin@evaluato.com',
          created_at: new Date().toISOString(),
          last_sign_in_at: new Date().toISOString(),
          email_confirmed_at: new Date().toISOString()
        },
        {
          id: 'demo2',
          email: 'cotitohn35@gmail.com',
          created_at: new Date().toISOString(),
          last_sign_in_at: new Date().toISOString(),
          email_confirmed_at: new Date().toISOString()
        }
      ];
      
      // Ordenar alfabéticamente y remover duplicados por email
      const uniqueUsers = users.filter((user, index, self) => 
        index === self.findIndex(u => u.email === user.email)
      ).sort((a, b) => a.email.localeCompare(b.email));
      
      console.log('✅ Usuarios procesados:', uniqueUsers.length);
      return uniqueUsers;
    }
    
    console.log('❌ No se pudo obtener usuario actual');
    return [];
    
  } catch (error) {
    console.error('❌ Error obteniendo usuarios registrados:', error);
    
    // Fallback: retornar usuarios de ejemplo
    return [
      {
        id: 'fallback1',
        email: 'cotitohn35@gmail.com',
        created_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
        email_confirmed_at: new Date().toISOString()
      },
      {
        id: 'fallback2',
        email: 'admin@evaluato.com',
        created_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
        email_confirmed_at: new Date().toISOString()
      }
    ];
  }
}

// Exportar todas las funciones
export {
  signIn,
  signUp,
  signOut,
  getCurrentUser,
  isAuthenticated,
  getProfessors,
  getProfessorById,
  getTopRatedProfessors,
  searchProfessors,
  submitEvaluation,
  hasUserEvaluatedProfessor,
  getUserEvaluations,
  getUserComments,
  getAllCommentsWithProfessors,
  likeComment,
  unlikeComment,
  hasUserLikedComment,
  getUserLikesForComments,
  addProfessor,
  syncAllProfessorRatings,
  getRandomUnevaluatedProfessor,
  getProfessorResources,
  hasProSubscription,
  uploadResource,
  rateResource,
  getUserStats,
  getTopContributors,
  // Funciones de admin
  isAdmin,
  isSuperAdmin,
  getAdminRole,
  getAllAdmins,
  addAdmin,
  updateAdminStatus,
  updateAdminRole,
  getAllRegisteredUsers,
  getAllResourcesForAdmin,
  updateResourceStatus,
  deleteResourcePermanently,
  getAdminStats,
  getPendingResources,
  approveResourcesBatch,
  rejectResourcesBatch,
  searchResourcesForAdmin,
  // Cliente de Supabase para diagnósticos
  supabaseClient
};

// Función para obtener URL de archivos
async function getResourceFileUrl(pathStorage) {
  try {
    const { data, error } = await supabaseClient.storage
      .from('recursos-pro')
      .createSignedUrl(pathStorage.replace('recursos-pro/', ''), 300); // 5 minutos
    
    if (error) throw error;
    return data.signedUrl;
  } catch (error) {
    console.error('Error obteniendo URL del archivo:', error);
    throw error;
  }
}

// Exportar la función adicional
export { getResourceFileUrl };
