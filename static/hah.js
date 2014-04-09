/* global gapi,angular */
'use strict';

function drawCardFromDeck(getJSONValue, setJSONValue, deckKey) {
  var get = getJSONValue.bind(null, deckKey),
      set = setJSONValue.bind(null, deckKey);

  return function(num) {
    var deck = get(),
        deckLen = deck.length,
        cards = [],
        number = num || 1;

    if(number < deckLen) {
      cards = deck.splice(0, number);
    } else {
      cards = deck;
      deck = [];
    }

    set(deck);
    return cards;
  };
}

angular.module('HangoutsAgainstHumanity', ['ngAnimate'])
  .factory('submitDelta', ['$timeout', function($timeout) {
    var next_submit,
        d, r;
    return function(delta, remove) {
      if(!next_submit) {
        d = {};
        r = [];
        next_submit = $timeout(function() {
          gapi.hangout.data.submitDelta(d, r);
          next_submit = undefined;
        }, 20);
      }
      for (var i in delta) {
        d[i] = JSON.stringify(delta[i] || null);
      }
      for (var j in remove) {
        if(r.indexOf(remove[j]) === -1) {
          r.push(remove[j]);
        }
      }
    };
  }])
  .factory('setJSONValue', ['submitDelta', function(submitDelta) {
    return function(key, value) {
      var delta = {};
      delta[key] = value;
      submitDelta(delta);
      return value;
    };
  }])
  .constant('getJSONValue', function(key) { return JSON.parse(gapi.hangout.data.getValue(key) || null); })
  .constant('whiteCardKey', 'white_cards')
  .constant('blackCardKey', 'black_cards')
  .constant('activeBlackCardKey', 'active_black_card')
  .constant('currentReaderKey', 'current_reader')
  .constant('currentStateKey', 'current_state')
  .constant('scoreboardKey', 'scoreboard')
  .constant('listeningForSubmissionKey', 'listening')
  .constant('cardSetKey', 'cardSets')
  .constant('choosingCardSetKey', 'choosingCardSets')
  .constant('RANDO_CARDRISSIAN_ID', 'RANDO_CARDRISSIAN')
  .constant('shuffle', function(array) {
    var i, j, swapped,
        arrLen = array.length;

    for (i = ((arrLen - 1) * 3); i >= 0; i--) {
      j = Math.floor(Math.random() * arrLen);
      swapped = array[i % arrLen];
      array[i % arrLen] = array[j];
      array[j] = swapped;
    }

    return array;
  })
  .factory('localParticipantId', function() {
    return gapi.hangout.getLocalParticipantId();
  })
  .factory('localParticipantCards', ['localParticipantId', function(localParticipantId) {
    return 'cards_' + localParticipantId;
  }])
  .factory('localParticipantNewCards', ['localParticipantId', function(localParticipantId) {
    return 'new_' + localParticipantId;
  }])
  .factory('drawWhiteCards', ['getJSONValue', 'setJSONValue', 'whiteCardKey', drawCardFromDeck])
  .factory('drawBlackCards', ['getJSONValue', 'setJSONValue', 'blackCardKey', drawCardFromDeck])
  .factory('drawNewQuestion', ['drawBlackCards', 'setJSONValue', 'activeBlackCardKey', 'blackCards', function(drawBlackCards, setJSONValue, activeBlackCardKey, blackCards) {
    return function() {
      var newCardIndex = drawBlackCards(1)[0];
      setJSONValue(activeBlackCardKey, newCardIndex);
      return blackCards().then(function(cards) {
        return cards[newCardIndex];
      });
    };
  }])
  .factory('submitCards', ['setJSONValue', 'localParticipantCards', 'whiteCards', function(setJSONValue, localParticipantCards, whiteCards) {
    var white;
    whiteCards().then(function(cards) {
      white = cards;
    });
    return function(cards) {
      var cardIds = [], i = 0, len = cards.length;

      for( ; i < len ; i++) {
        cardIds[i] = white.indexOf(cards[i]);
      }

      setJSONValue(localParticipantCards, cardIds);
    };
  }])
  .factory('watchForNewParticipants', [function() {
    return function(callback) {
      var func = function(evt) {
            callback(evt.enabledParticipants);
          },
          cancel = function() {
            gapi.hangout.onParticipantsEnabled.remove(func);
          };

      gapi.hangout.onParticipantsEnabled.add(func);
      return cancel;
    };
  }])
  .factory('watchForSubmittedCards', ['$filter', 'getJSONValue', 'submitDelta', 'listeningForSubmissionKey', 'whiteCards', 'RANDO_CARDRISSIAN_ID', function($filter, getJSONValue, submitDelta, listeningForSubmissionKey, whiteCards, RANDO_CARDRISSIAN_ID) {
    return function(callback) {
      var func = function(evt) {
            var newCards = $filter('filter')(evt.addedKeys, function(x) {
              return x.key.search('cards_') === 0;
            });
            var rando_hand = $filter('filter')(evt.addedKeys, function(x) {
              return x.key === RANDO_CARDRISSIAN_ID;
            });
            angular.forEach(rando_hand, function(r_obj) {
              r_obj.lastWriter = RANDO_CARDRISSIAN_ID;
            });

            newCards = newCards.concat(rando_hand);

            whiteCards().then(function(white) {
              angular.forEach(newCards, function(obj) {
                obj.value = getJSONValue(obj.key);

                angular.forEach(obj.value, function(cardId, i) {
                  obj.value[i] = white[cardId];
                });
              });
              if(!!newCards.length) {
                callback(newCards);
              }
            });
          },
          cancel = function() {
            gapi.hangout.data.onStateChanged.remove(func);
            delta[listeningForSubmissionKey] = false;
            submitDelta(delta);
          },
          delta = {};

      delta[listeningForSubmissionKey] = true;
      submitDelta(delta);
      gapi.hangout.data.onStateChanged.add(func);

      return cancel;
    };
  }])
  .factory('sendCards', ['submitDelta', 'drawWhiteCards', function(submitDelta, drawWhiteCards) {
    return function(playerIds, cards) {
      var delta = {},
          remove = [],
          newCards = drawWhiteCards(playerIds.length * cards);

      angular.forEach(playerIds, function(p) {
        delta['new_' + p] = newCards.splice(0, cards);
        remove.push('cards_' + p);
      });

      submitDelta(delta, remove);
    };
  }])
  .factory('cardSetsDefer', ['$q', 'getJSONValue', 'cardSetKey', function($q, getJSONValue, cardSetKey) {
    var defer = $q.defer();
    if (angular.isString(getJSONValue(cardSetKey))) {
      defer.resolve(getJSONValue(cardSetKey));
    }
    return defer;
  }])
  .factory('whiteCards', ['$http', '$q', 'cardSetsDefer', function($http, $q, cardSetsDefer) {
    var whiteCards,
        promise = cardSetsDefer.promise.then(function(sets) {
          return $http.get('//hangouts-against-humanity.appspot.com/white?sets=' + sets);
        }).then(function(response) {
          return (whiteCards = response.data);
        });
    return function() {
      if(!whiteCards) {
        return promise;
      } else {
        return $q.when(whiteCards);
      }
    };
  }])
  .factory('blackCards', ['$http', '$q', 'cardSetsDefer', function($http, $q, cardSetsDefer) {
    var blackCards,
        promise = cardSetsDefer.promise.then(function(sets) {
          return $http.get('//hangouts-against-humanity.appspot.com/black?sets=' + sets);
        }).then(function(response) {
          return (blackCards = response.data);
        });
    return function() {
      if(!blackCards) {
        return promise;
      } else {
        return $q.when(blackCards);
      }
    };
  }])
  .factory('transferToNextPlayer', ['submitDelta', 'currentReaderKey', 'activeBlackCardKey', 'localParticipantId', function(submitDelta, readerKey, activeBlackCardKey, myId) {
    return function() {
      var delta = {},
          participants = gapi.hangout.getEnabledParticipants().map(function(p) { return p.id; }).sort(),
          me = participants.indexOf(myId),
          next = (me + 1) % participants.length;

      delta[activeBlackCardKey] = '';
      delta[readerKey] = participants[next];

      submitDelta(delta);
    };
  }])
  .factory('selectWinner', ['submitDelta', 'getJSONValue', 'scoreboardKey', 'RANDO_CARDRISSIAN_ID', function(submitDelta, getJSONValue, scoreboardKey, RANDO_CARDRISSIAN_ID) {
    return function(participant) {
      var x = {},
          scores = getJSONValue(scoreboardKey);

      participant = (participant === RANDO_CARDRISSIAN_ID ? 'Rando Cardrissian' : gapi.hangout.getParticipantById(participant).person.displayName);
      scores[participant] = (scores[participant] || 0) + 1;
      x[scoreboardKey] = scores;

      submitDelta(x);
    };
  }])
  .factory('randoPlayerDraws', ['submitDelta', 'RANDO_CARDRISSIAN_ID', 'drawWhiteCards', function(submitDelta, RANDO_CARDRISSIAN_ID, drawWhiteCards) {
    return function(pick) {
      var x = {};
      x[RANDO_CARDRISSIAN_ID] = drawWhiteCards(pick);
      submitDelta(x);
    };
  }])
  .factory('playSound', [function() {
    return {
          yeah: gapi.hangout.av.effects.createAudioResource('//hangouts-against-humanity.appspot.com/static/audio/yeah.wav').createSound({localOnly: false, loop: false}),
          boo: gapi.hangout.av.effects.createAudioResource('//hangouts-against-humanity.appspot.com/static/audio/boo.wav').createSound({localOnly: false, loop: false}),
          cheer: gapi.hangout.av.effects.createAudioResource('//hangouts-against-humanity.appspot.com/static/audio/cheer.wav').createSound({localOnly: false, loop: false}),
          ready: gapi.hangout.av.effects.createAudioResource('//hangouts-against-humanity.appspot.com/static/audio/ready-here-we-go.wav').createSound({localOnly: true, loop: false}),
          timer: gapi.hangout.av.effects.createAudioResource('//hangouts-against-humanity.appspot.com/static/audio/timer.wav').createSound({localOnly: false, loop: false}),
          sadtrombone: gapi.hangout.av.effects.createAudioResource('//hangouts-against-humanity.appspot.com/static/audio/sadtrombone.wav').createSound({localOnly: false, loop: false}),
          rimshot: gapi.hangout.av.effects.createAudioResource('//hangouts-against-humanity.appspot.com/static/audio/rimshot.wav').createSound({localOnly: false, loop: false})
        };
  }])
  .factory('videoCanvas', [function() {
    var canvas = gapi.hangout.layout.getVideoCanvas();

    canvas.setPosition(500, 10);
    canvas.setWidth(500);
    canvas.setVisible(true);
    return canvas;
  }])
  .factory('chooseCardSet', ['getJSONValue', 'setJSONValue', 'choosingCardSetKey', function(getJSONValue, setJSONValue, choosingCardSetKey) {
    if(!getJSONValue(choosingCardSetKey)) {
      return setJSONValue(choosingCardSetKey, true);
    } else {
      return false;
    }
  }])
  .run(['submitDelta', 'shuffle', 'whiteCardKey', 'blackCardKey', 'currentReaderKey', 'scoreboardKey', 'localParticipantId', 'sendCards', 'whiteCards', 'blackCards', 'gameState', '$q', 'videoCanvas', function(submitDelta, shuffle, whiteCardKey, blackCardKey, currentReaderKey, scoreboardKey, localParticipantId, sendCards, whiteCards, blackCards, gameState, $q) {
    function saveDeck(cardKey) {
      return function(cardIds) {
        var x = {};
        x[cardKey] = cardIds;
        submitDelta(x);
        return cardIds;
      };
    }

    function buildDeck(cards) {
      var c = [],
          i = 0, len = cards.length;

      for( ; i < len ; i++) {
        c[i] = i;
      }
      return shuffle(c);
    }

    function ifNotAlreadySaved(cardKey) {
      return function(cards) {
        if (angular.isUndefined(gapi.hangout.data.getValue(cardKey))) {
          return cards;
        } else {
          return $q.reject();
        }
      };
    }

    whiteCards()
      .then(ifNotAlreadySaved(whiteCardKey))
      .then(buildDeck)
      .then(saveDeck(whiteCardKey))
      .then(function pullMyCards(cardIds) {
        if(angular.isUndefined(gapi.hangout.data.getValue(currentReaderKey))) {
          var x = {};
          x[currentReaderKey] = localParticipantId;
          submitDelta(x);
          gapi.hangout.data.onStateChanged.add(function _temporaryName(evt) {
            if(evt.addedKeys.some(function(k) { return k.key === whiteCardKey; })) {
              sendCards([ localParticipantId ], 10);
              gapi.hangout.data.onStateChanged.remove(_temporaryName);
            }
          });
        }
        return cardIds;
      });

    blackCards()
      .then(ifNotAlreadySaved(blackCardKey))
      .then(buildDeck)
      .then(saveDeck(blackCardKey));


    var x = {};
    gameState.score[gapi.hangout.getLocalParticipant().person.displayName] = 0;
    x[scoreboardKey] = gameState.score;
    submitDelta(x);

  }])
  .factory('gameState', ['activeBlackCardKey', 'currentReaderKey', 'listeningForSubmissionKey', 'scoreboardKey', 'localParticipantNewCards', 'cardSetKey', 'getJSONValue', 'whiteCards', 'blackCards', '$rootScope', 'cardSetsDefer', 'localParticipantId', function(activeBlackCardKey, currentReaderKey, listeningForSubmissionKey, scoreboardKey, localParticipantNewCards, cardSetKey, getJSONValue, whiteCards, blackCards, $rootScope, cardSetsDefer, localParticipantId) {
    var item = {},
        white, black;

    whiteCards().then(function(cards) {
      var newCards = getJSONValue(localParticipantNewCards);
      item.newCards = [];
      if (angular.isArray(newCards)) {
        angular.forEach(newCards, function(cardId, i) {
          item.newCards[i] = cards[cardId];
        });
      }
      return cards;
    }).then(function(cards) {
      white = cards;
    });

    blackCards().then(function(cards) {
      var activeQuestion = getJSONValue(activeBlackCardKey);
      item.activeQuestion = cards[activeQuestion || ''];
      return cards;
    }).then(function(cards) {
      black = cards;
    });

    item.currentReader = getJSONValue(currentReaderKey);
    item.canSubmit = getJSONValue(listeningForSubmissionKey);
    item.score = getJSONValue(scoreboardKey) || {};

    gapi.hangout.data.onStateChanged.add(
      function(evt) {
        var questionChange,
            readerChange,
            canSubmit,
            newCards,
            score,
            cardSets;

        questionChange = readerChange = canSubmit = newCards = score = cardSets = false;

        angular.forEach(evt.addedKeys, function(v) {
          questionChange = (v.key === activeBlackCardKey ? true : questionChange);
          readerChange = (v.key === currentReaderKey ? true : readerChange);
          canSubmit = (v.key === listeningForSubmissionKey ? true : canSubmit);
          newCards = (v.key === localParticipantNewCards ? true : newCards);
          score = (v.key === scoreboardKey ? true : score);
          cardSets = (v.key === cardSetKey ? v.value : cardSets);
        });

        if(questionChange || readerChange || canSubmit || newCards || score || cardSets) {
          item.activeQuestion = (questionChange ? black[getJSONValue(activeBlackCardKey)] : item.activeQuestion);
          item.currentReader = (readerChange ? getJSONValue(currentReaderKey) : item.currentReader);
          item.canSubmit = (canSubmit ? getJSONValue(listeningForSubmissionKey) : item.canSubmit);
          item.score = (score ? getJSONValue(scoreboardKey) : item.score);
          if(newCards) {
            item.newCards = [];
            angular.forEach(getJSONValue(localParticipantNewCards), function(c, i) {
              item.newCards[i] = white[c];
            });
            gapi.hangout.data.clearValue(localParticipantNewCards);
          }
          if(cardSets) {
            cardSetsDefer.resolve(getJSONValue(cardSetKey));
          }
          $rootScope.$apply();
        }
      });

    item.ChangeOfActiveQuestion = function ChangeOfActiveQuestion() {
      return item.activeQuestion;
    };

    item.AmICurrentReader = function AmICurrentReader() {
      return item.currentReader === localParticipantId;
    };

    item.CanSubmit = function CanSubmit() {
      return item.canSubmit;
    };

    item.NewCardsDealt = function NewCardsDealt() {
      return item.newCards;
    };

    item.ScoreChange = function ScoreChange() {
      return item.score;
    };

    return item;
  }])
  .controller('CardSetSelect', ['$scope', 'cardSetsDefer', 'setJSONValue', 'cardSetKey', function($scope, cardSetsDefer, setJSONValue, cardSetKey) {
    $scope.cardSets = [
      { label: 'Base Set', value: 'base' },
      { label: 'First Expansion', value: 'first' },
      { label: 'Second Expansion', value: 'second' },
      { label: 'Third Expansion', value: 'third' },
      { label: 'Fourth Expansion', value: 'fourth' },
      { label: 'Cards Against Gallifrey (Doctor Who variant)', value: 'gall' }
    ];

    $scope.cards = {};

    $scope.submit = function() {
      var cards = [];
      angular.forEach($scope.cards, function(value, key) {
        if (value) {
          cards.push(key);
        }
      });
      if(cards.length > 0) {
        cardSetsDefer.resolve(cards.join('+'));
        $scope.initialState.choose = false;
        setJSONValue(cardSetKey, cards.join('+'));
      }
    };
  }])
  .controller('TableCtrl', ['$scope', '$sce', 'gameState', 'submitCards', 'watchForSubmittedCards', 'drawNewQuestion', 'watchForNewParticipants', 'transferToNextPlayer', 'sendCards', 'playSound', 'selectWinner', 'chooseCardSet', 'randoPlayerDraws', function($scope, $sce, gameState, submitCards, watchForSubmittedCards, drawNewQuestion, watchForNewParticipants, transferToNextPlayer, sendCards, playSound, selectWinner, chooseCardSet, randoPlayerDraws) {

    function convertCardTextToTrustedHtml(card) {
      card.text = $sce.trustAsHtml(card.text);
      return card;
    }

    var cancelReader,
        cancelNewParticipantsWatch,
        blankCard = convertCardTextToTrustedHtml({ text: 'Waiting for a Question...' });

    $scope.initialState = {
      choose: chooseCardSet
    };

    $scope.hand = [];
    $scope.submittedCards = [];

    $scope.playSound = function(sound) {
      playSound[sound].play();
    };

    $scope.selectCard = function(index) {
      if(!$scope.isReader) {
        $scope.submittedCards.push($scope.hand.splice(index, 1)[0]);
      }
    };

    $scope.unselectCard = function(index) {
      $scope.hand.push($scope.submittedCards.splice(index, 1)[0]);
    };

    $scope.disableSubmit = false;
    $scope.submitCards = function(cards) {
      submitCards(cards);
      $scope.submittedCards = [];
      $scope.disableSubmit = true;
    };

    $scope.isReader = false;

    $scope.$watch(gameState.ChangeOfActiveQuestion, function(newVal) {
      var card = blankCard;
      $scope.disableSubmit = !newVal;
      if (!!newVal) {
        card = convertCardTextToTrustedHtml(newVal);
      }
      $scope.question = card;
    });

    $scope.$watch(gameState.AmICurrentReader, function(newVal) {
      $scope.isReader = newVal;
      if(!!newVal) {
        $scope.submittedPlayers = [];
        $scope.disableDrawQuestion = !($scope.disableShowAnswers = $scope.disableMoveToNext = $scope.disableSelectWinner = true);

        cancelNewParticipantsWatch = watchForNewParticipants(function(participants) {
          sendCards(participants.map(function(p) { return p.id; }), 10);
        });
      }
    });

    $scope.$watch(gameState.CanSubmit, function(newVal) {
      $scope.disableSubmit = !newVal;
    });

    $scope.$watch(gameState.NewCardsDealt, function(newVal) {
      if(angular.isArray(newVal)) {
        $scope.hand = $scope.hand.concat(newVal.map(convertCardTextToTrustedHtml));
      }
    });

    $scope.$watch(gameState.ScoreChange, function(newScore) {
      $scope.scoreboard = newScore;
    });

    /* Dealer-specific */
    $scope.moveToNext = function() {

      $scope.disableDrawQuestion = !($scope.disableShowAnswers = $scope.disableMoveToNext = $scope.disableSelectWinner = true);

      transferToNextPlayer();
      sendCards($scope.submittedPlayers.map(function(p) { return p.player; }), $scope.question.pick - $scope.question.draw );

      cancelNewParticipantsWatch();
    };

    $scope.showAnswers = function() {
      cancelReader();

      $scope.disableSelectWinner = !($scope.disableDrawQuestion = $scope.disableShowAnswers = $scope.disableMoveToNext = true);
    };

    $scope.selected = {};
    $scope.selectWinner = function() {
      selectWinner($scope.selected.winner.player);
      $scope.selected = {};

      $scope.disableMoveToNext = !($scope.disableDrawQuestion = $scope.disableShowAnswers = $scope.disableSelectWinner = true);
    };

    $scope.drawNewQuestion = function() {
      $scope.disableShowAnswers = !($scope.disableDrawQuestion = $scope.disableMoveToNext = $scope.disableSelectWinner = true);
      $scope.submittedPlayers = [];

      drawNewQuestion().then(function(newQuestion) {
        var draw = parseInt(newQuestion.draw, 10),
            pick = parseInt(newQuestion.pick, 10);

        if(angular.isString(newQuestion.draw) && (0 !== draw)) {
          sendCards(gapi.hangout.getEnabledParticipants().map(function(p) { return p.id; }), newQuestion.draw);
        }

        // Draw Rando Cardrissian card(s)
        randoPlayerDraws(pick);
      });

      cancelReader = watchForSubmittedCards(function(newSubmissions) {
        angular.forEach(newSubmissions, function(submission) {
          $scope.submittedPlayers.push({
              player: submission.lastWriter,
              cards: submission.value.map(convertCardTextToTrustedHtml)
          });
        });
        if($scope.submittedPlayers.length === gapi.hangout.getEnabledParticipants().length) {
          playSound.ready.play();
        }
      });
    };
  }]);
